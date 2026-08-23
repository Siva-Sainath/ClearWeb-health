# webcmd Integration

Clearweb Health exposes a bridge so external agents (webcmd) and backend services can read live UI state and inject dashboard actions.

## Architecture & Flow

1. **Aria Agent Streaming & Parsing**: When Aria finishes streaming an agent response in `backend/services/ariaAgent.js`, `parseAllTags` parses embedded action tags (`[action:...]`) and navigation tags (`[navigate:...]`).
2. **UI Command Dispatching**: If `WEBCMD_ENABLED` is true, `ariaAgent.js` invokes `executeUICommands({ actions: parsed.actions, navigations: parsed.navigations })` in `backend/services/webcmdExecutor.js`.
3. **Navigation to Action Mapping**: `webcmdExecutor.js` converts navigation events to UI actions via `navigationsToActions()`:
   - `phase` -> `{ type: "navigate_phase", payload: "<phase>" }`
   - `tab` -> `{ type: "tab", payload: "<tab>" }`
   - `panel` -> `{ type: "navigate_panel", payload: "<panel>" }`
   - `scroll` -> `{ type: "navigate_scroll", payload: "<facilityId>" }`
   - `url` -> `{ type: "navigate_url", payload: "<url>" }`
4. **Queue Ingestion**: `postWebcmdActions` pushes the action payload to the Next.js bridge endpoint `POST /api/webcmd-action` with bearer token authentication (`WEBCMD_BRIDGE_SECRET`).
5. **Frontend Polling & Execution**: `WebcmdPollHandler.tsx` polls `GET /api/webcmd-action` every 500ms and executes incoming UI commands (phase changes, scrape triggering, scrolling, URL opening, dashboard filters/tabs/cards).
6. **External Agents**: External agents (webcmd) can read UI state via `/api/page-state` and inject commands via `/api/webcmd-action` using the same queue.

## Endpoints

- `GET /api/page-state` — full snapshot of UI state (requires `Authorization: Bearer $WEBCMD_BRIDGE_SECRET` in production)
- `GET /api/webcmd-action` — dequeue pending actions for frontend execution
- `POST /api/webcmd-action` — queue UI actions (requires `Authorization: Bearer $WEBCMD_BRIDGE_SECRET` in production)

## Example

```bash
export WEBCMD_BRIDGE_SECRET=your-secret

# Read current page snapshot
curl -H "Authorization: Bearer $WEBCMD_BRIDGE_SECRET" \
  http://localhost:3000/api/page-state

# Inject a spotlight UI action
curl -X POST -H "Authorization: Bearer $WEBCMD_BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"spotlight","payload":"n5"}' \
  http://localhost:3000/api/webcmd-action
```

## Action Types

- `tab`: switch active results tab (`map`, `cards`, `table`, etc.)
- `spotlight`: highlight and focus on a specific facility ID
- `filter`: set active filtering criteria
- `sort`: change sorting mode (`cost`, `distance`, `quality`, etc.)
- `compare`: trigger comparison view between facilities
- `show_card`: expand a facility card
- `reset`: reset dashboard view and filters
- `navigate_phase`: switch journey phase (e.g. `scraping`, `results`, `detail`)
- `navigate_panel`: scroll to a designated dashboard panel (`#panel-<id>`)
- `navigate_scroll`: scroll to a designated facility card (`#facility-<id>`)
- `navigate_url`: open an external URL in a new window/tab

