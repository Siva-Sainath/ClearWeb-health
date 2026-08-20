#!/usr/bin/env python3
"""
Create Bright Data Scraper Studio collectors for the 7 independent Austin hospitals.
Writes collector IDs to data/independent_collector_ids.json and prints targets.yaml snippets.

Usage:
    python scripts/create_independent_collectors.py
    python scripts/create_independent_collectors.py --hospital westlake_medical_center
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

from collectors.brightdata import create_collector  # noqa: E402

OUT_PATH = ROOT / "data" / "independent_collector_ids.json"

PROMPT = (
    "CMS hospital price transparency scraper for {name}. "
    "Read cms-hpt.txt at the site root OR follow the footer Price Transparency link. "
    "Return JSON with mrf_url: the direct download URL to the machine-readable "
    "standard charges file (.csv or .json) for this facility."
)


def load_independents() -> list[dict]:
    with open(ROOT / "targets.yaml", encoding="utf-8") as fh:
        hospitals = yaml.safe_load(fh).get("hospitals", [])
    return [h for h in hospitals if h.get("system") == "independent"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hospital", default="", help="Single hospital id")
    args = parser.parse_args()

    targets = load_independents()
    if args.hospital:
        targets = [t for t in targets if t["id"] == args.hospital]
        if not targets:
            sys.exit(f"Unknown hospital: {args.hospital}")

    existing: dict[str, str] = {}
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text())

    results: dict[str, dict] = dict(existing)
    for hospital in targets:
        hid = hospital["id"]
        if results.get(hid, {}).get("collector_id"):
            print(f"[skip] {hid} already has {results[hid]['collector_id']}")
            continue

        seed = hospital.get("price_transparency_page") or hospital["homepage"]
        name = hospital.get("collector_name") or hid
        prompt = PROMPT.format(name=hospital["name"])[:500]
        print(f"\n[create] {name} @ {seed[:60]}…")
        try:
            data = create_collector(seed, prompt, name=name, timeout=600)
            cid = data["collector_id"]
            results[hid] = {
                "collector_id": cid,
                "collector_name": name,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "seed_url": seed,
            }
            OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
            OUT_PATH.write_text(json.dumps(results, indent=2) + "\n")
            print(f"[ok] {hid} → {cid}")
        except Exception as exc:
            print(f"[fail] {hid}: {exc}")
            results[hid] = {"error": str(exc), "collector_name": name}
            OUT_PATH.write_text(json.dumps(results, indent=2) + "\n")

    print("\n--- Paste into targets.yaml (collector_id fields) ---")
    for hid, info in results.items():
        if info.get("collector_id"):
            print(f"  {hid}: {info['collector_id']}")


if __name__ == "__main__":
    main()
