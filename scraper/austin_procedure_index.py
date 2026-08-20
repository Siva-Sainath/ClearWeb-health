#!/usr/bin/env python3
"""
austin_procedure_index.py
Build a full procedure + price index across Austin hospitals from their MRF files.
Output: scraper/data/austin_index.json
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

from discover import discover_mrf  # noqa: E402
from pipeline.ingest import download_file  # noqa: E402
from pipeline.normalize import normalize_file  # noqa: E402


def load_targets() -> list[dict]:
    with open(ROOT / "targets.yaml", encoding="utf-8") as fh:
        return yaml.safe_load(fh).get("hospitals", [])


def build_index() -> dict:
    targets = load_targets()
    index: dict = {
        "hospitals": {},
        "procedures": defaultdict(lambda: {"payers": set(), "hospitals": set(), "min_price": None, "max_price": None}),
    }

    for hospital in targets:
        hid = hospital["id"]
        print(f"Indexing {hospital['name']} ...")
        try:
            mrf_url, source = discover_mrf(hospital)
            raw = download_file(mrf_url, hid).path
            rows = normalize_file(raw, hid, "json", source_url=mrf_url, filter_codes=None)
        except Exception as exc:
            print(f"  skipped: {exc}")
            continue

        # Procedure index
        for row in rows:
            code = row["procedure_code"]
            proc = index["procedures"][code]
            proc["hospitals"].add(hid)
            proc["payers"].add(row.get("payer") or "Unknown")
            proc["procedure_name"] = row.get("procedure_name") or proc.get("procedure_name", "")
            price = row["price"]
            if proc["min_price"] is None or price < proc["min_price"]:
                proc["min_price"] = price
            if proc["max_price"] is None or price > proc["max_price"]:
                proc["max_price"] = price

        # Hospital summary
        payers = {r.get("payer") for r in rows if r.get("payer")}
        codes = {r["procedure_code"] for r in rows}
        index["hospitals"][hid] = {
            "name": hospital["name"],
            "row_count": len(rows),
            "procedures": len(codes),
            "payers": len(payers),
            "source_url": mrf_url,
            "source_type": source,
        }

    # Convert sets to lists for JSON serialization
    for code, proc in index["procedures"].items():
        proc["payers"] = sorted(proc["payers"])
        proc["hospitals"] = sorted(proc["hospitals"])

    index["procedures"] = dict(index["procedures"])
    return index


def main() -> None:
    idx = build_index()
    out = ROOT / "data" / "austin_index.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(idx, fh, indent=2, default=list)
    print(f"Wrote {out} — {len(idx['hospitals'])} hospitals, {len(idx['procedures'])} procedures")


if __name__ == "__main__":
    main()
