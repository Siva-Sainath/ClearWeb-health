# Task: Agentic results mode (less scripted)

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `frontend/src/components/ResultsView.tsx`, `frontend/src/hooks/useScrapeJob.ts`, `frontend/.env.example`, `backend/services/promptBuilder.js` (results prompt only if needed)

## Problem
`ResultsView` sets `autoStart: !llmExplanation` but `llmExplanation` is ALWAYS set (deterministic), so Aria agent never auto-starts on results. `ExplanationStage` runs a scripted walkthrough instead.

## Requirements
1. Add env `NEXT_PUBLIC_AGENTIC_RESULTS=true` (document in `.env.example`)
2. When `AGENTIC_RESULTS` true:
   - `useScrapeJob` calls `fetchLlmExplanation` even without `USE_LLM_EXPLANATION` OR set both flags together
   - `ResultsView`: `autoStart: true` for useAriaAgent
   - Hide or skip `ExplanationStage` auto-play when agentic (agent drives UI via tags)
3. When false, keep current behavior
4. `cd frontend && npm run build` must pass

## Acceptance
PASS/FAIL + summary.
