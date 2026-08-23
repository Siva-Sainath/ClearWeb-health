#!/usr/bin/env python3
"""Reset failed collector_jobs to pending for another collector_loop pass."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db.store import init_db, reset_collector_jobs_to_pending, collector_jobs_summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", action="append", default=[], help="Reset specific slug(s) only")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    init_db()
    if args.dry_run:
        print(collector_jobs_summary())
        return
    n = reset_collector_jobs_to_pending(args.slug or None)
    print(f"Reset {n} failed job(s) to pending")
    print(collector_jobs_summary())


if __name__ == "__main__":
    main()
