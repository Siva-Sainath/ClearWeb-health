#!/usr/bin/env python3
"""Apply collector IDs from data/independent_collector_ids.json into targets.yaml."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).parent.parent
IDS_PATH = ROOT / "data" / "independent_collector_ids.json"
TARGETS = ROOT / "targets.yaml"


def main() -> None:
    if not IDS_PATH.exists():
        sys.exit(f"No collector IDs file at {IDS_PATH} — run create_independent_collectors.py first")

    ids = json.loads(IDS_PATH.read_text())
    text = TARGETS.read_text(encoding="utf-8")
    updated = 0
    for hid, info in ids.items():
        cid = info.get("collector_id")
        if not cid:
            continue
        pattern = rf'(  - id: {re.escape(hid)}\n(?:.*\n)*?    collector_id: )"[^"]*"'
        repl = rf'\1"{cid}"'
        new_text, n = re.subn(pattern, repl, text, count=1)
        if n:
            text = new_text
            updated += 1
            print(f"Updated {hid} → {cid}")

    if updated:
        TARGETS.write_text(text, encoding="utf-8")
        print(f"\nWrote {updated} collector_id(s) to targets.yaml")
    else:
        print("No targets updated — check hospital ids match")


if __name__ == "__main__":
    main()
