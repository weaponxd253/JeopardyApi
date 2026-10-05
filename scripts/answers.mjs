// Answer normalization shared by the data checker.

// Keep in sync with normalizeAnswer() in jeopardyStudy/script.js. Two answers
// that normalize to the same string are interchangeable in the game, so
// listing both is redundant.
const ANSWER_PREFIX = /^(?:(?:what|who|where|when)\s+(?:is|are|was|were)\s+|(?:what|who|where)'s\s+)/;
const LEADING_ARTICLE = /^(?:a|an|the)\s+/;

export function normalizeAnswer(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’`]/g, "'")
    .trim()
    .replace(ANSWER_PREFIX, '')
    .replace(LEADING_ARTICLE, '')
    .replace(/[-–—_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s+#]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Of several answers that mean the same thing, keep the one players should
// see: not phrased as a question, and the most complete spelling of it
// ("<p>" over "p", "margin: 0 auto" over "margin 0 auto"); ties keep the
// first listed.
function isQuestionPhrased(answer) {
  const text = answer.trim().toLowerCase();
  return ANSWER_PREFIX.test(text.replace(/[‘’`]/g, "'")) || text.endsWith('?');
}

// A leading article doesn't make an answer more complete: "shark" stays
// "shark", not "a shark".
function displayLength(answer) {
  return answer.trim().replace(/^(?:a|an|the)\s+/i, '').length;
}

export function dedupeAnswers(answers) {
  const groups = new Map();
  answers.forEach((answer, index) => {
    const key = normalizeAnswer(answer);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });

  const keep = new Set();
  for (const indexes of groups.values()) {
    const plain = indexes.filter(i => !isQuestionPhrased(answers[i]));
    const best = plain.length
      ? plain.reduce((a, b) => (displayLength(answers[b]) > displayLength(answers[a]) ? b : a))
      : indexes[0];
    keep.add(best);
  }
  return answers.filter((_, index) => keep.has(index));
}
