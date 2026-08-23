#!/usr/bin/env bash
# Preflight checks for autonomous UI test — verifies data + brain, does NOT run a demo.
set -euo pipefail
BACKEND="${BACKEND_URL:-http://localhost:3001}"
PROFILE='{"zipCode":"78701","procedure":"Brain MRI","insurance":"Aetna","city":"Austin","radiusMi":25,"priorities":["cost"]}'

echo "=== Health ==="
curl -sf "$BACKEND/api/health" | python3 -m json.tool | head -20

echo ""
echo "=== Cache (78701) ==="
curl -sf "$BACKEND/api/prices/cache-check?zip=78701&radius=25" | python3 -m json.tool

echo ""
echo "=== Brain session (cached, agentic) ==="
curl -sf -X POST "$BACKEND/api/scrape/session" \
  -H "Content-Type: application/json" \
  -d "{\"profile\":$PROFILE,\"mode\":\"cached\",\"agentic\":true}" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('status:', d.get('status'))
print('mode:', d.get('presentationMode'))
print('facilities:', len(d.get('results') or {}))
print('replayEvents:', len(d.get('replayEvents') or []))
print('scrapeContext:', bool(d.get('scrapeContext')))
print('explanation:', bool(d.get('explanation')))
print('presentation steps:', len((d.get('presentation') or {}).get('steps') or []))
print('top pick:', (d.get('executiveSummary') or {}).get('recommendation',{}).get('facility',{}).get('hospital_name','?'))
"

echo ""
echo "OK — start backend + frontend, copy frontend/.env.autonomous-test.example → .env.local"
echo "Test profile: test-data/austin-autonomous-ui.json"
echo "Research brief: UI_RESEARCH_BRIEF.md"
