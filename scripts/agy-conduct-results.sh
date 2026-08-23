#!/usr/bin/env bash
# External Gemini/Antigravity conductor — read live UI + scraped data, drive dashboard via webcmd.
# Usage: ./scripts/agy-conduct-results.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="${FRONTEND_URL:-http://localhost:3000}"
BACKEND="${BACKEND_URL:-http://localhost:3001}"
SECRET="${WEBCMD_BRIDGE_SECRET:-clearweb-dev-bridge}"

echo "=== Page state ==="
STATE=$(curl -sf -H "Authorization: Bearer $SECRET" "$FRONTEND/api/page-state")
echo "$STATE" | head -c 2000
echo ""

echo "=== Backend conduct-results (Ollama/local LLM) ==="
curl -sf -X POST "$BACKEND/api/agent/conduct-results" \
  -H "Content-Type: application/json" \
  -d "$(echo "$STATE" | python3 -c "
import json,sys
s=json.load(sys.stdin)
print(json.dumps({
  'profile': s.get('patientProfile',{}),
  'facilities': {},  # use page-state facility summaries only in agy prompt
  'presentationMode': s.get('scrapePresentationMode'),
  'healEvents': s.get('scrapeHealEvents',[]),
  'executiveSummary': s.get('executiveSummary'),
}))
")" | head -c 1500

echo ""
echo "=== Or run Antigravity with full state ==="
echo "agy --model gemini-3.7-flash-medium --print \"Read $FRONTEND/api/page-state (Bearer secret). POST UI actions to $FRONTEND/api/webcmd-action as {type,payload}. Use layout, spotlight, tab, reveal. Facilities in snapshot.\""
