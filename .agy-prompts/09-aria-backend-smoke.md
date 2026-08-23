# Task: Aria voice backend smoke test

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `backend/services/ariaAgent.js`, `backend/services/ttsService.js`, `backend/server.js` routes only.

## Context
Act 3 demo uses Groq TTS. Backend routes likely include `/api/aria/*` or `/api/tts` — grep `server.js`.

Env in `backend/.env` has `GROQ_API_KEY` (do NOT print). If missing, test should report SKIP not FAIL.

## Steps
1. Grep `server.js` for aria/tts/analyse routes
2. Start backend if needed, curl healthiest lightweight endpoint (e.g. analyse with minimal JSON or TTS ping)
3. If 200 with valid JSON/audio headers → PASS
4. If 503/missing key → reply `SKIP — no GROQ_API_KEY`
5. Fix ONLY broken route wiring if 500 with key present
6. Stop backend if you started it

## Acceptance
Reply `PASS`, `SKIP`, or `FAIL` + one line.
