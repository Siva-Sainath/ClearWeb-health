# Task: Trust panel + results wiring audit (manual test matrix #1, #5)

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** Frontend files only:
- `frontend/src/components/ResultsView.tsx`
- `frontend/src/components/ResultsLayoutShell.tsx`
- `frontend/src/components/ScrapeTrustPanel.tsx`
- `frontend/src/context/AppContext.tsx`
- `frontend/src/hooks/useScrapeJob.ts`

## Context (from docs/HACKATHON_DEMO.md)
- Test #1: proof-reel plays; heal toast if in events
- Test #5: Trust panel shows `c_*` collector IDs

Expected wiring:
1. `useScrapeJob.startProofReelFlow` sets `scrapeLastUpdated` + `scrapeHealEvents` from `/api/prices/query`
2. `ResultsView` passes `lastUpdated`, `healEvents`, `scrapeEvents` to `ScrapeTrustPanel`
3. `ResultsLayoutShell` shows `trust` slot in `explore` mode (not only `trustGaps`)
4. `ScrapeTrustPanel` derives collector IDs from `scrapeEvents[].collector_id` and `healEvents`

## Steps
1. Read files and verify each expectation (grep/read — no browser)
2. If any link is missing or broken, fix with minimal diff
3. Run `cd frontend && npm run build`

## Acceptance
Reply `PASS` or `FAIL` + list which file you changed (or "no changes").
