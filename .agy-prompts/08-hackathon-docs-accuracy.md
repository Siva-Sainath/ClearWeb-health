# Task: HACKATHON_DEMO.md accuracy vs code

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `docs/HACKATHON_DEMO.md` and `README.md` links only. Do NOT change application code.

## Context
Doc says:
- `NEXT_PUBLIC_HACKATHON_DEMO_MODE=true` for live scrape
- Table also mentions `HACKATHON_DEMO_MODE=false` (backend?) — verify actual env vars in:
  - `frontend/src/hooks/useScrapeJob.ts`
  - `backend/.env.example`
  - `frontend/.env.example` or `.env.local` patterns

Also verify:
- `docs/HACKATHON_DEMO.md` path to `healer_architecture.md` is correct
- Manual test matrix matches current feature flags (`NEXT_PUBLIC_SKIP_SCRAPE_ANIMATION`)

## Steps
1. Grep codebase for env var names
2. Update `docs/HACKATHON_DEMO.md` ONLY where docs contradict code (minimal edits)
3. Do not add new sections — fix inaccuracies only

## Acceptance
Reply `PASS` + list doc lines changed, or `PASS — docs accurate, no changes`.
