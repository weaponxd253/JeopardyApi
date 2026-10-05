#!/usr/bin/env node
// Validates topics.json and every topic file it lists.
//
//   node scripts/check-data.mjs          check everything, exit 1 on errors
//   node scripts/check-data.mjs --fix    also remove duplicate accepted answers
//
// Errors fail the check (and CI). Warnings are printed but don't fail it.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnswer, dedupeAnswers } from './answers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'topics.json';
const FIX = process.argv.includes('--fix');
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);

const problems = [];
const error = (file, message) => problems.push({ level: 'error', file, message });
const warn = (file, message) => problems.push({ level: 'warning', file, message });

// ─── Helpers ──────────────────────────────────────────────────────
function readJSON(file) {
  const path = join(ROOT, file);
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    error(file, `can't read file: ${err.message}`);
    return null;
  }
  try {
    return { raw, data: JSON.parse(raw) };
  } catch (err) {
    error(file, `invalid JSON: ${err.message}`);
    return null;
  }
}

const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';

// Rewrites just the answers arrays in the raw text, so the file's hand-made
// layout is untouched. Arrays are located by walking the document in order.
function rewriteAnswerArrays(raw, replacements) {
  let out = '';
  let cursor = 0;

  for (const { original, updated } of replacements) {
    const marker = '"answers"';
    let at = raw.indexOf(marker, cursor);
    let start;
    while (at !== -1) {
      start = raw.indexOf('[', at);
      const end = findArrayEnd(raw, start);
      const parsed = JSON.parse(raw.slice(start, end));
      if (JSON.stringify(parsed) === JSON.stringify(original)) {
        out += raw.slice(cursor, start) + formatArray(raw.slice(start, end), updated);
        cursor = end;
        break;
      }
      at = raw.indexOf(marker, end);
    }
    if (at === -1) throw new Error(`could not locate answers ${JSON.stringify(original)}`);
  }

  return out + raw.slice(cursor);
}

function findArrayEnd(raw, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      if (char === '\\') i += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']' && (depth -= 1) === 0) return i + 1;
  }
  throw new Error('unterminated array');
}

// Reuse each surviving answer's original source text so escapes and
// spacing stay exactly as they were.
function formatArray(source, updated) {
  const items = [];
  let i = 1;
  while (i < source.length - 1) {
    const quote = source.indexOf('"', i);
    if (quote === -1) break;
    let j = quote + 1;
    while (source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
    items.push(source.slice(quote, j + 1));
    i = j + 1;
  }
  const wanted = new Set(updated);
  const kept = [];
  for (const item of items) {
    const value = JSON.parse(item);
    if (wanted.has(value)) {
      kept.push(item);
      wanted.delete(value);
    }
  }
  return source.includes('\n')
    ? `[\n${kept.map(item => `${source.match(/\n(\s*)"/)[1]}${item}`).join(',\n')}\n${source.match(/\n(\s*)\]$/)?.[1] ?? ''}]`
    : `[${kept.join(', ')}]`;
}

// ─── Manifest ─────────────────────────────────────────────────────
function checkManifest() {
  const result = readJSON(MANIFEST);
  if (!result) return [];

  const topics = result.data;
  if (!Array.isArray(topics) || topics.length === 0) {
    error(MANIFEST, 'must be a non-empty array of topics');
    return [];
  }

  const filenames = new Map();
  const icons = new Map();

  topics.forEach((topic, index) => {
    const where = `entry ${index + 1}${topic?.label ? ` (${topic.label})` : ''}`;
    if (!topic || typeof topic !== 'object') {
      error(MANIFEST, `${where} is not an object`);
      return;
    }

    for (const field of ['label', 'filename', 'category', 'icon']) {
      if (!isNonEmptyString(topic[field])) error(MANIFEST, `${where} is missing "${field}"`);
    }

    if (isNonEmptyString(topic.filename)) {
      if (filenames.has(topic.filename)) {
        error(MANIFEST, `${where} reuses filename "${topic.filename}" from ${filenames.get(topic.filename)}`);
      } else {
        filenames.set(topic.filename, where);
      }
      if (!existsSync(join(ROOT, `${topic.filename}.json`))) {
        error(MANIFEST, `${where} points to ${topic.filename}.json, which doesn't exist`);
      }
    }

    if (isNonEmptyString(topic.icon)) {
      if (icons.has(topic.icon)) {
        warn(MANIFEST, `${where} uses the same icon ${topic.icon} as ${icons.get(topic.icon)}`);
      } else {
        icons.set(topic.icon, where);
      }
    }
  });

  const listed = new Set([...filenames.keys()].map(name => `${name}.json`));
  readdirSync(ROOT)
    .filter(file => file.endsWith('.json') && file !== MANIFEST && !listed.has(file))
    .forEach(file => warn(file, `not listed in ${MANIFEST}, so it never appears in the game`));

  return [...listed].filter(file => existsSync(join(ROOT, file)));
}

// ─── Topic files ──────────────────────────────────────────────────
function checkTopic(file) {
  const result = readJSON(file);
  if (!result) return;
  const { raw, data } = result;

  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    error(file, 'needs a non-empty "categories" array');
    return;
  }
  if (!data.questions || typeof data.questions !== 'object' || Array.isArray(data.questions)) {
    error(file, 'needs a "questions" object');
    return;
  }

  const categoryIds = new Set();
  const ladders = new Map();
  const replacements = [];

  data.categories.forEach((category, index) => {
    const id = category?.id;
    const label = `category ${index + 1}${category?.name ? ` (${category.name})` : ''}`;

    if (id === undefined || id === null || id === '') {
      error(file, `${label} has no "id"`);
      return;
    }
    if (!isNonEmptyString(category.name)) error(file, `${label} has no "name"`);
    if (categoryIds.has(String(id))) error(file, `${label} reuses id ${id}`);
    categoryIds.add(String(id));

    const group = data.questions[String(id)];
    if (!group || typeof group !== 'object') {
      error(file, `${label} has no questions under "questions.${id}"`);
      return;
    }

    const values = Object.keys(group);
    ladders.set(label, values.map(Number).sort((a, b) => a - b).join('/'));

    for (const value of values) {
      const where = `${category.name ?? id} $${value}`;
      const q = group[value];

      if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
        error(file, `${where}: "${value}" is not a positive dollar value`);
      }
      if (!q || typeof q !== 'object') {
        error(file, `${where}: question entry must be an object`);
        continue;
      }
      if (!isNonEmptyString(q.question)) error(file, `${where}: missing question text`);
      if (!isNonEmptyString(q.explanation)) error(file, `${where}: missing explanation`);

      if (!Array.isArray(q.answers) || q.answers.length === 0) {
        error(file, `${where}: needs at least one accepted answer`);
        continue;
      }
      if (!q.answers.every(isNonEmptyString)) {
        error(file, `${where}: every answer must be a non-empty string`);
        continue;
      }
      if (q.answers.some(answer => normalizeAnswer(answer) === '')) {
        error(file, `${where}: an answer is only punctuation or filler, so it can never match`);
      }

      const deduped = dedupeAnswers(q.answers);
      if (deduped.length < q.answers.length) {
        if (FIX) {
          replacements.push({ original: q.answers, updated: deduped });
        } else {
          const dropped = q.answers.filter(answer => !deduped.includes(answer));
          error(file, `${where}: redundant answers ${JSON.stringify(dropped)} (run with --fix)`);
        }
      }
    }
  });

  Object.keys(data.questions)
    .filter(key => !categoryIds.has(key))
    .forEach(key => warn(file, `"questions.${key}" doesn't belong to any category, so it never appears`));

  if (new Set(ladders.values()).size > 1) {
    warn(file, `categories use different dollar values: ${[...ladders].map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  }

  if (replacements.length) {
    const updated = rewriteAnswerArrays(raw, replacements);
    writeFileSync(join(ROOT, file), updated);
    console.log(`fixed ${replacements.length} answer list(s) in ${file}`);
  }
}

// ─── Run ──────────────────────────────────────────────────────────
const files = checkManifest();
files.forEach(checkTopic);

for (const { level, file, message } of problems) {
  console.log(IN_CI ? `::${level} file=${file}::${message}` : `${level.toUpperCase()} ${file}: ${message}`);
}

const errors = problems.filter(p => p.level === 'error').length;
const warnings = problems.length - errors;
console.log(`\nChecked ${files.length} topic files: ${errors} error(s), ${warnings} warning(s).`);
process.exitCode = errors ? 1 : 0;
