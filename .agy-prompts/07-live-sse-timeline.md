# Task: Live SSE scrape timeline audit (manual test matrix #4)

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** Frontend scrape hooks only:
- `frontend/src/hooks/useScrapeTimeline.ts`
- `frontend/src/hooks/useScrapeStream.ts`
- `frontend/src/hooks/useScrapeReplay.ts`
- `frontend/src/components/ScrapeCanvas.tsx`
- `frontend/src/lib/types.ts`

## Context
Live mode (`scrapePresentationMode === "live"`):
- Timeline polls `GET /api/scrape/:jobId/events` (SSE)
- Must handle events: `heal_triggered`, `heal_resumed`, `heal_failed`, `price_extracted`
- `ScrapeCanvas` sets `scrapeComplete` for live: `scrapeStatus === "complete" && timeline.timelineComplete`
- `goToResults` must call `setScrapeStatus("complete")` so Header badge clears

## Steps
1. Trace live SSE path from `useScrapeTimeline` → event reducer → `healingNode` / `healCount`
2. Confirm `heal_failed` is in `ScraperLog.event` union and handled in reducer (clears healing state)
3. Confirm `parseStreamPayload` maps `brightdata_collector_id` and `hospital_id`
4. Fix ONLY if you find a clear bug (missing case, wrong active gate, etc.)
5. `cd frontend && npm run build`

## Acceptance
Reply `PASS` or `FAIL` + one-line summary of findings/fixes.
