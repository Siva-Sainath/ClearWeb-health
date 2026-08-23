#!/usr/bin/env python3
"""Bulk-create Bright Data collectors for Texas hospital candidates."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.bulk_create import create_collectors_bulk, HospitalCandidate

CANDIDATES_PATH = ROOT / "data" / "texas_candidates.json"


def load_candidates() -> list[HospitalCandidate]:
    raw = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    out: list[HospitalCandidate] = []
    for row in raw:
        out.append(
            {
                "name": row["name"],
                "slug": row["slug"],
                "domain": row["domain"],
                "url": row["url"],
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=5, help="Max collectors to create this run")
    parser.add_argument("--dry-run", action="store_true", help="List candidates only")
    parser.add_argument("--execute", action="store_true", help="Call Bright Data create (consumes credits)")
    args = parser.parse_args()

    candidates = load_candidates()
    regions = Counter(json.loads(CANDIDATES_PATH.read_text())[i].get("region", "?") for i in range(len(candidates)))
    print(f"Loaded {len(candidates)} candidates — regions: {dict(regions)}")

    batch = candidates[: max(0, args.batch)]
    if args.dry_run or not args.execute:
        for c in batch:
            print(f"  [{c['slug']}] {c['name']} — {c['url']}")
        if not args.execute:
            print("Dry run only. Pass --execute to create collectors via bdata.")
        return

    create_collectors_bulk(batch)
    print(f"Queued creation for {len(batch)} collectors. Run sweep_collector_jobs.py after builds finish.")


if __name__ == "__main__":
    main()
