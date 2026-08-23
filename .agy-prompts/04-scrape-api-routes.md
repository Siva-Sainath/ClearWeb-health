# Task: Scrape job API routes smoke test

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** Test `backend/server.js` scrape routes only. Fix ONLY `backend/server.js` or `backend/services/scrapeService.js` if route wiring is broken.

## Context
Routes:
- `POST /api/scrape/start` body `{ profile: { zipCode, procedure, insurance, cptCode, radiusMi } }`
- `GET /api/scrape/:jobId/results`
- `GET /api/scrape/:jobId/events` (SSE)
- `DELETE /api/scrape/:jobId`

`scrapeService.startScrape()` requires `BRIGHT_DATA_API_TOKEN` in `backend/.env` (do NOT print env values).

## Steps
1. Start backend if not running: `cd backend && node server.js` (background), wait 3s
2. POST start with profile `{ zipCode: "78701", procedure: "MRI", insurance: "Aetna", radiusMi: 25 }`
3. If 200: capture `jobId`, curl `GET .../results` once (status running or complete OK)
4. Curl `GET .../events` with `--max-time 5` — confirm SSE headers (`text/event-stream`) and at least one `data:` line OR job already complete
5. DELETE job to clean up
6. If 503 (no token): confirm error JSON mentions token — that is PASS for missing-creds case
7. Stop backend if you started it

## Acceptance
Reply `PASS` or `FAIL` + one line. Do not run a full 15-min scrape; cancel after confirming SSE works.
