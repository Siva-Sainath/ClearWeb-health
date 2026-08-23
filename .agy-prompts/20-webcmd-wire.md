# Task: Wire webcmd bridge for agent-driven UI

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `backend/services/ariaAgent.js`, `backend/services/webcmdExecutor.js`, `docs/webcmd-integration.md` only.

## Context
`webcmdExecutor.js` exists but is NEVER called from `ariaAgent.js`. Frontend `WebcmdPollHandler.tsx` polls `/api/webcmd-action` every 500ms.

When Aria finishes streaming, `parseAllTags` yields `actions` and `navigations`. These should ALSO be pushed via `executeUICommands()` so:
- External agents can inject actions through same queue
- Deployed split-stack (Vercel frontend + Render backend) gets server-pushed UI updates

## Requirements
1. Import `executeUICommands` in `ariaAgent.js`
2. After `parseAllTags`, call `void executeUICommands({ actions: parsed.actions, navigations: parsed.navigations })` when WEBCMD_ENABLED
3. Map navigations correctly (webcmdExecutor already has `navigationsToActions`)
4. Update `docs/webcmd-integration.md` to reflect wired behavior
5. `node --check` on modified files

## Acceptance
Reply PASS/FAIL + files changed.
