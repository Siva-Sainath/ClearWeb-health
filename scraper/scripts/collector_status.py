#!/usr/bin/env python3
"""JSON summary of collector_jobs + heal stats for backend API."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db.store import collector_jobs_summary, get_heal_events, init_db  # noqa: E402


def main() -> None:
    init_db()
    summary = collector_jobs_summary()
    heals = get_heal_events(limit=15)
    print(
        json.dumps(
            {
                **summary,
                "healEvents": heals,
                "healSuccessCount": sum(1 for h in heals if h.get("success")),
            }
        )
    )


if __name__ == "__main__":
    main()
