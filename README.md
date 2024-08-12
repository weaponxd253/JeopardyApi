# Jeopardy API

## Overview

The Jeopardy API is a RESTful service that provides programmatic access to a collection of Jeopardy-style trivia questions and categories. The API supports various categories, including HTML, CSS, JavaScript, Python, Java, C++, Biology, SQL, and more. This API is useful for developers looking to integrate trivia questions into their applications, such as quiz games, educational tools, or other interactive experiences.

## Features

- **Multiple Categories**: Access questions from a wide range of categories including programming languages, biology, IT fundamentals, and more.
- **Question Difficulty**: Questions are categorized by difficulty levels (100 to 500 points).
- **JSON Format**: All responses are returned in JSON format, making it easy to parse and integrate into your application.
- **Category Filtering**: Fetch questions based on specific categories.
- **Random Question Selection**: Retrieve random questions to keep the quiz experience dynamic and engaging.

## Available Categories

The API currently supports the following categories:

1. **Programming Languages**
   - HTML, CSS, JavaScript, Python, Java, C++
   
2. **Science**
   - Biology, Cell Biology, Genetics, Human Anatomy, Ecology, Evolution, Microbiology

3. **Information Technology**
   - Computer Hardware, Networking Basics, Operating Systems, Cybersecurity Fundamentals, Software and Applications, IT Troubleshooting
   
4. **Database Management**
   - SQL Basics, Advanced SQL, Database Design, SQL Performance, Stored Procedures, SQL Security

5. **User Experience Design**
   - User Research, Information Architecture, Interaction Design, Visual Design, Usability Principles, Design Thinking

## Endpoints

### 1. Get All Categories
- **Endpoint**: `/categories`
- **Method**: `GET`
- **Description**: Retrieves a list of all available categories.

### 2. Get Questions by Category
- **Endpoint**: `/categories/{category_id}/questions`
- **Method**: `GET`
- **Description**: Retrieves all questions for a specified category.
- **Parameters**:
  - `category_id`: ID of the category (e.g., 1 for HTML, 13 for Biology).

### 3. Get a Specific Question
- **Endpoint**: `/categories/{category_id}/questions/{question_id}`
- **Method**: `GET`
- **Description**: Retrieves a specific question by its ID.
- **Parameters**:
  - `category_id`: ID of the category.
  - `question_id`: ID of the question (e.g., 100 for the first question in a category).

### 4. Get a Random Question
- **Endpoint**: `/random`
- **Method**: `GET`
- **Description**: Fetches a random question from any category.

## Data Structure

The questions are stored in JSON format, and each question is associated with a category. Below is an example structure:

```json
{
  "id": 1,
  "name": "HTML",
  "questions": {
    "100": {
      "question": "What does HTML stand for?",
      "answers": ["Hypertext Markup Language", "HTML"],
      "explanation": "HTML stands for Hypertext Markup Language. It is the standard language for creating webpages and web applications."
    },
    ...
  }
}
