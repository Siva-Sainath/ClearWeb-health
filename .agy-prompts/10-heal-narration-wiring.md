# Task: Scrape narration + heal toast wiring

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:**
- `frontend/src/hooks/useScrapeNarration.ts`
- `frontend/src/lib/scrapeNarration.ts`
- `frontend/src/components/ScrapeCanvas.tsx` (pendingHealLine only)

## Context
Manual test #1: proof-reel plays; heal toast/narration when `heal_triggered` in events.

Flow:
- `useScrapeTimeline` calls `onHealEvent` → `ScrapeCanvas.handleHealEvent` → `setPendingHealLine`
- `useScrapeNarration` speaks `pendingHealLine` via `healNarrationLine()`

## Steps
1. Trace heal narration path; confirm `heal_failed` also triggers line (or add minimal case in `healLineFromLog` / `useScrapeNarration.ts`)
2. Fix ONLY if heal events are silently dropped
3. `cd frontend && npm run build`

## Acceptance
Reply `PASS` or `FAIL` + files changed.
