# Task: Smoke test Express prices API

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** Start backend briefly, hit `/api/prices/query`, fix ONLY if route or service is broken.

## Context
- Backend entry: `backend/server.js` (port 3001 default)
- Route: `GET /api/prices/query?zip=&procedure=&insurance=&cpt=`
- Service: `backend/services/priceQueryService.js` spawns `scraper/query_prices.py`
- Env: `backend/.env` exists (do NOT print secrets)

## Your job
1. Check if port 3001 already in use (`lsof -i :3001` or curl)
2. If not running: `cd backend && node server.js` in background, wait ~3s
3. `curl -s "http://localhost:3001/api/prices/query?zip=78701&procedure=MRI&insurance=Aetna" | head -c 2000`
4. Confirm HTTP 200 and JSON has `results`, `healEvents`, `replayEvents`
5. If 500/error, read server logs, fix minimal issue in `priceQueryService.js` or `server.js` route handler only
6. Kill the backend process you started (if you started it)

## Acceptance
- curl returns 200 with expected JSON shape
- Reply: `PASS` or `FAIL` + one-line summary
