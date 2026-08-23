# Task: Free-tier deploy config (Vercel + Render)

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `render.yaml`, `docs/DEPLOY.md`, `frontend/vercel.json`, `backend/.env.example`, `frontend/.env.example`

## Requirements
1. Create `render.yaml` at repo root for backend web service:
   - build: `cd backend && npm install`
   - start: `cd backend && node server.js`
   - env vars documented (not values): GROQ_API_KEY, BRIGHT_DATA_API_TOKEN, BRIGHTDATA_UNLOCKER_ZONE, FRONTEND_URL, WEBCMD_BRIDGE_SECRET, LLM_PROVIDER=openrouter, OPENROUTER_API_KEY
2. `docs/DEPLOY.md` step-by-step:
   - Vercel: root directory `frontend`, set NEXT_PUBLIC_BACKEND_URL to Render URL
   - Render: connect repo, use render.yaml
   - Shared WEBCMD_BRIDGE_SECRET on both
3. Update `frontend/vercel.json` if needed (rewrites not required for external API)
4. Note: scraper Python does NOT run on free tier — CI runs scrapes; app uses cached `/api/prices/query`

## Acceptance
PASS/FAIL + deploy doc path.
