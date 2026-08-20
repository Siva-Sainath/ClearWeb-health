#!/usr/bin/env bash
# Bright Data + Python scraper setup for Clearweb Health Austin demo
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRAPER="$ROOT/scraper"

echo "🕸️  Bright Data + scraper setup"

# ── Python venv ──────────────────────────────────────────────────────────────
if [ ! -d "$SCRAPER/.venv" ]; then
  echo "Creating Python venv in scraper/.venv ..."
  python3 -m venv "$SCRAPER/.venv"
fi
# shellcheck disable=SC1091
source "$SCRAPER/.venv/bin/activate"
pip install -q --upgrade pip
pip install -q -r "$SCRAPER/requirements.txt"

# ── scraper .env ─────────────────────────────────────────────────────────────
if [ ! -f "$SCRAPER/.env" ]; then
  cp "$SCRAPER/.env.example" "$SCRAPER/.env"
  echo "Created scraper/.env — add BRIGHTDATA_API_KEY"
fi

# Sync key from backend if present
if [ -f "$ROOT/backend/.env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/backend/.env" 2>/dev/null || true
  if [ -n "${BRIGHT_DATA_API_TOKEN:-}" ] && grep -q "your_brightdata_api_key_here" "$SCRAPER/.env" 2>/dev/null; then
    sed -i.bak "s/your_brightdata_api_key_here/${BRIGHT_DATA_API_TOKEN}/" "$SCRAPER/.env" && rm -f "$SCRAPER/.env.bak"
    echo "Synced BRIGHTDATA_API_KEY from backend/.env"
  fi
fi

mkdir -p "$SCRAPER/data/raw" "$SCRAPER/data/logs"

# ── CLI verify ───────────────────────────────────────────────────────────────
echo ""
echo "Bright Data CLI version:"
npx -p @brightdata/cli bdata --version

if [ -f "$SCRAPER/.env" ]; then
  # shellcheck disable=SC1091
  source "$SCRAPER/.env"
fi

if [ -z "${BRIGHTDATA_API_KEY:-}" ] || [ "$BRIGHTDATA_API_KEY" = "your_brightdata_api_key_here" ]; then
  echo ""
  echo "⚠️  BRIGHTDATA_API_KEY not set."
  echo "   Get it from: https://brightdata.com/cp/setting/users"
  echo "   Paste into scraper/.env AND backend/.env (as BRIGHT_DATA_API_TOKEN)"
else
  export BRIGHTDATA_API_KEY
  echo ""
  echo "✓ API key loaded (ends ...${BRIGHTDATA_API_KEY: -6})"
  echo "  Test: npx -p @brightdata/cli bdata scraper run <collector_id> <url>"
fi

# ── MCP (optional) ───────────────────────────────────────────────────────────
echo ""
echo "Optional — add Bright Data MCP to Cursor:"
echo "  npx -p @brightdata/cli brightdata add mcp --agent cursor --project"
echo "  (or copy .cursor/mcp.json.example → .cursor/mcp.json and set API_TOKEN)"

echo ""
echo "Next steps:"
echo "  1. Fill mrf_seed_url + collector_id in scraper/targets.yaml"
echo "  2. bash scripts/create-collectors.sh   # after manual URL verification"
echo "  3. python scraper/watcher.py --interval 6   # start continuous monitoring"
echo "  4. bash scripts/dev-setup.sh && run backend + frontend"
