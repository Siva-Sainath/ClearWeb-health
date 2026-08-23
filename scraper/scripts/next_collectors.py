#!/usr/bin/env python3
"""Create BD collectors only for uncovered Texas hospitals (skip cached Austin targets)."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

from db.store import init_db, collector_job_exists
from pipeline.bulk_create import create_collectors_bulk, HospitalCandidate

CANDIDATES = ROOT / "data" / "texas_candidates.json"
TARGETS = ROOT / "targets.yaml"
DB = ROOT / "data" / "chargemaster.db"


def cached_hospital_ids() -> set[str]:
    if not DB.exists():
        return set()
    conn = sqlite3.connect(DB)
    try:
        rows = conn.execute("SELECT DISTINCT hospital_id FROM price_records").fetchall()
        return {r[0] for r in rows}
    except sqlite3.OperationalError:
        return set()
    finally:
        conn.close()


def target_slugs() -> set[str]:
    """Slugs already covered in targets.yaml (Austin metro collectors)."""
    if not TARGETS.exists():
        return set()
    data = yaml.safe_load(TARGETS.read_text(encoding="utf-8")) or {}
    slugs: set[str] = set()
    for h in data.get("hospitals", []):
        if h.get("id"):
            slugs.add(str(h["id"]).lower())
        if h.get("collector_name"):
            slugs.add(str(h["collector_name"]).lower())
    return slugs


def pending_slugs() -> set[str]:
    if not DB.exists():
        return set()
    conn = sqlite3.connect(DB)
    try:
        rows = conn.execute("SELECT slug FROM collector_jobs").fetchall()
        return {r[0] for r in rows}
    except sqlite3.OperationalError:
        return set()
    finally:
        conn.close()


def filter_candidates(candidates: list[dict]) -> list[HospitalCandidate]:
    covered = target_slugs()
    jobs = pending_slugs()
    cached = cached_hospital_ids()
    out: list[HospitalCandidate] = []

    for c in candidates:
        slug = c.get("slug", "")
        region = c.get("region", "")

        if slug in jobs:
            continue
        if slug.lower() in covered:
            continue
        if region == "austin":
            continue
        if slug in cached:
            continue

        out.append(
            {
                "name": c["name"],
                "slug": slug,
                "domain": c.get("domain", ""),
                "url": c["url"],
                "city": c.get("city", ""),
                "region": region,
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=25, help="Max collectors this run (0 = all eligible)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()

    raw = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    eligible = filter_candidates(raw)
    batch = eligible if args.batch <= 0 else eligible[: args.batch]

    print(f"Eligible (uncovered): {len(eligible)} | batch: {len(batch)}")
    print(f"Skipping: {len(raw) - len(eligible)} (targets.yaml, austin region, cache, or already queued)")
    for c in batch:
        print(f"  [{c['region']}] {c['slug']} — {c['name']}")

    if args.dry_run or not args.execute:
        if not args.execute:
            print("\nPass --execute to create collectors.")
        return

    init_db()
    ids = create_collectors_bulk(batch)
    print(f"\nCreated {len(ids)} collectors:")
    for cid in ids:
        print(f"  {cid}")


if __name__ == "__main__":
    main()
