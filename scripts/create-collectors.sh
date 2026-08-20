#!/usr/bin/env bash
# Create Bright Data Scraper Studio collectors for Austin targets (one-time setup).
# Requires BRIGHTDATA_API_KEY in scraper/.env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRAPER="$ROOT/scraper"

# shellcheck disable=SC1091
source "$SCRAPER/.venv/bin/activate" 2>/dev/null || true
# shellcheck disable=SC1091
[ -f "$SCRAPER/.env" ] && source "$SCRAPER/.env"

if [ -z "${BRIGHTDATA_API_KEY:-}" ] || [ "$BRIGHTDATA_API_KEY" = "your_brightdata_api_key_here" ]; then
  echo "ERROR: Set BRIGHTDATA_API_KEY in scraper/.env first"
  echo "Get key from: https://brightdata.com/cp/setting/users"
  exit 1
fi

export BRIGHTDATA_API_KEY
BD="npx -p @brightdata/cli bdata"

prompt_for() {
  local name="$1"
  cat <<EOF
Find the CMS machine-readable price transparency file (MRF) for "${name}".
Navigate from the Price Transparency footer link or CMS-required .txt file.
Return the direct download URL of the JSON standard charges file for this specific facility — not a page URL.
If multiple facilities are listed, select "${name}" exactly.
EOF
}

create_one() {
  local id="$1" name="$2" url="$3"
  echo ""
  echo "════════════════════════════════════════"
  echo "Creating collector: $name"
  echo "URL: $url"
  local prompt
  prompt=$(prompt_for "$name")
  local out
  out=$($BD scraper create "$url" "$prompt" 2>&1) || { echo "$out"; return 1; }
  echo "$out"
  echo ""
  echo "→ Paste the c_* collector ID into targets.yaml for id: $id"
}

# HCA — one collector can often serve multiple facilities on same portal;
# create separate collectors per facility for heal isolation in demo.
create_one "st_davids_medical_center_austin" \
  "St. David's Medical Center" \
  "https://www.stdavids.com/patient-resources/patient-financial-resources/pricing-transparency-cms-required-file-of-standard-charges"

create_one "dell_seton_medical_center" \
  "Dell Seton Medical Center at The University of Texas" \
  "https://healthcare.ascension.org/price-transparency"

create_one "bsw_medical_center_austin" \
  "Baylor Scott & White Medical Center - Austin" \
  "https://www.bswhealth.com/patient-tools/price-transparency"

echo ""
echo "Done. Update scraper/targets.yaml with collector IDs, then run:"
echo "  python scraper/run_pipeline.py --hospital-id st_davids_medical_center_austin"
