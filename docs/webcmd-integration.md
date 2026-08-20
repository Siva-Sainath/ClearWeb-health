# webcmd Integration

Clearweb Health exposes a bridge so external agents (webcmd) can read live UI state and inject dashboard actions.

## Endpoints

- `GET /api/page-state` — full snapshot (requires `Authorization: Bearer $WEBCMD_BRIDGE_SECRET` in production)
- `POST /api/webcmd-action` — queue UI actions (same auth)

## Example

```bash
export WEBCMD_BRIDGE_SECRET=your-secret

curl -H "Authorization: Bearer $WEBCMD_BRIDGE_SECRET" \
  http://localhost:3000/api/page-state

curl -X POST -H "Authorization: Bearer $WEBCMD_BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"spotlight","payload":"n5"}' \
  http://localhost:3000/api/webcmd-action
```

## Action types

`tab`, `spotlight`, `filter`, `sort`, `compare`, `show_card`, `reset`, `navigate_phase`, `navigate_panel`, `navigate_scroll`, `navigate_url`

Backend `webcmdExecutor.js` posts actions after each Aria voice response.
