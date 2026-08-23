#!/usr/bin/env python3
"""Create collectors with validated cms-hpt seeds, then RUN them to ingest MRF URLs."""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

from db.store import init_db
from pipeline.bulk_create import create_collector, HospitalCandidate
from scripts.next_collectors import filter_candidates
from scripts.resolve_seed_url import resolve_candidate, SKIP_SLUGS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CANDIDATES = ROOT / "data" / "texas_candidates.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate URLs → create BD collectors → run collector_loop")
    parser.add_argument("--batch", type=int, default=20, help="Max new collectors to create")
    parser.add_argument("--create-only", action="store_true")
    parser.add_argument("--run-only", action="store_true", help="Only run collector_loop on pending jobs")
    parser.add_argument("--run-max", type=int, default=10, help="Max pending jobs to run per invocation")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.run_only:
        raw = json.loads(CANDIDATES.read_text(encoding="utf-8"))
        eligible = filter_candidates(raw)
        batch = eligible[: max(0, args.batch)]

        valid: list[HospitalCandidate] = []
        skipped: list[tuple[str, str]] = []

        for c in batch:
            if c["slug"] in SKIP_SLUGS:
                skipped.append((c["slug"], "skip list"))
                continue
            res = resolve_candidate(c)
            if not res.ok:
                skipped.append((c["slug"], res.detail))
                logger.warning("[%s] SKIP invalid URL: %s", c["slug"], res.detail)
                continue
            c["url"] = res.seed_url
            valid.append(c)
            logger.info("[%s] seed=%s (%s)", c["slug"], res.seed_url, res.source)

        print(f"\nCreate batch: {len(valid)} valid | {len(skipped)} skipped | {len(eligible)} eligible total")
        for slug, reason in skipped[:15]:
            print(f"  skip {slug}: {reason}")

        if args.dry_run:
            return

        init_db()
        created = 0
        for hosp in valid:
            cid = create_collector(hosp)
            if cid:
                created += 1
        print(f"\nCreated {created} collectors (run phase uses credits per bdata scraper run)")

        if args.create_only:
            return

    if args.dry_run:
        return

    loop = ROOT / "scripts" / "collector_loop.py"
    logger.info("Running collector_loop --max %d (sync scrape + heal + targets.yaml)", args.run_max)
    subprocess.run(
        [sys.executable, str(loop), "--max", str(args.run_max)],
        cwd=str(ROOT),
        check=False,
    )


if __name__ == "__main__":
    main()
