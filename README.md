# StudyBuddy AI

StudyBuddy AI is a hackathon-ready web app for university students. Students upload lecture PDFs or TXT notes and get summaries, MCQs, flashcards, a notes-only chat tutor, and an exam countdown study planner.

## Features

- PDF/TXT upload and browser-side text extraction
- Exam-ready summaries
- MCQ quiz flow with scoring and explanations
- Flip-style flashcards
- Chat answers grounded in uploaded notes
- Study planner with daily tasks and countdowns
- Dark mode, responsive layout, local demo storage
- Optional Gemini API key support with offline fallback generation

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

No install step is required because the app uses plain HTML, CSS, and JavaScript. PDF parsing loads PDF.js from CDN in the browser. If internet is not available, TXT uploads and the demo notes still work.

## Optional Live AI

Open the settings button in the app and paste a Gemini API key. If the key is missing, invalid, or quota-limited, the app automatically uses local generation so the hackathon demo can continue.

## Demo Flow

1. Click **Try as guest**.
2. Upload a lecture PDF or click **Load demo notes**.
3. Generate a summary.
4. Generate and answer a quiz.
5. Generate flashcards and flip through them.
6. Ask a question in chat.
7. Add an exam date in the planner.

## Suggested Pitch

"Pakistani students waste hours turning scattered slides into useful revision. StudyBuddy AI lets them upload once and instantly get summaries, quizzes, flashcards, a private tutor, and a day-by-day exam plan."
