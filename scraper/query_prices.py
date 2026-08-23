#!/usr/bin/env python3
"""
query_prices.py — Cached price query for Express /api/prices/query
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from db.store import get_heal_events, init_db  # noqa: E402
from match_engine import load_targets, match_facility, rank_results  # noqa: E402
from db.store import get_rows_for_hospital  # noqa: E402

EVENTS_CACHE = ROOT / "data" / "last_scrape_events.json"
DEMO_EVENTS = ROOT.parent / "frontend" / "src" / "data" / "austinDemoSnapshot.json"


def load_replay_events() -> list[dict]:
    if EVENTS_CACHE.exists():
        try:
            data = json.loads(EVENTS_CACHE.read_text(encoding="utf-8"))
            events = data.get("replayEvents") or data.get("events") or []
            if events:
                return events
        except (json.JSONDecodeError, OSError):
            pass
    if DEMO_EVENTS.exists():
        try:
            snap = json.loads(DEMO_EVENTS.read_text(encoding="utf-8"))
            return snap.get("replayEvents") or snap.get("events") or []
        except (json.JSONDecodeError, OSError):
            pass
    return []


def heal_events_from_replay(replay: list[dict]) -> list[dict]:
    succeeded = {
        e.get("hospital_id")
        for e in replay
        if e.get("event") == "price_extracted" and e.get("hospital_id")
    }
    out: list[dict] = []
    for e in replay:
        event = e.get("event")
        if event == "heal_triggered":
            hid = e.get("hospital_id")
            out.append(
                {
                    "timestamp": e.get("ts"),
                    "collector_id": e.get("collector_id"),
                    "reason": e.get("detail"),
                    "success": bool(hid and hid in succeeded),
                }
            )
        elif event == "heal_resumed":
            out.append(
                {
                    "timestamp": e.get("ts"),
                    "collector_id": e.get("collector_id"),
                    "reason": e.get("detail"),
                    "success": True,
                }
            )
        elif event == "heal_failed":
            out.append(
                {
                    "timestamp": e.get("ts"),
                    "collector_id": e.get("collector_id"),
                    "reason": e.get("detail"),
                    "success": False,
                }
            )
    return out[-10:]


def build_profile(args: argparse.Namespace) -> dict:
    return {
        "condition": args.procedure or "",
        "procedure": args.procedure or "",
        "cptCode": args.cpt or "",
        "insurance": args.insurance or "",
        "zipCode": args.zip or "78701",
        "radiusMi": 25,
        "priorities": ["cost"],
    }


def query_prices(profile: dict) -> dict:
    init_db()
    targets = load_targets()
    results: dict[str, dict] = {}
    collector_ids: list[str] = []

    for hospital in targets:
        rows = get_rows_for_hospital(hospital["id"])
        if not rows:
            continue
        cid = hospital.get("collector_id")
        if cid:
            collector_ids.append(cid)
        facility = match_facility(hospital, rows, profile, {})
        if facility:
            results[facility["id"]] = facility

    ranked = rank_results(results, profile.get("priorities") or [])
    replay_events = load_replay_events()
    heal_events = get_heal_events(limit=20)
    heal_count = sum(1 for e in heal_events if e.get("success"))
    if not heal_events:
        derived = heal_events_from_replay(replay_events)
        if derived:
            heal_events = derived
            heal_count = sum(1 for e in heal_events if e.get("success"))

    last_updated = None
    if ranked:
        times = [f.get("scraped_at") for f in ranked.values() if f.get("scraped_at")]
        if times:
            last_updated = max(times)

    return {
        "results": ranked,
        "events": [],
        "replayEvents": replay_events,
        "lastUpdated": last_updated or datetime.now(timezone.utc).isoformat(),
        "healSummary": {
            "healCount": heal_count,
            "collectorIds": list(dict.fromkeys(collector_ids)),
        },
        "healEvents": heal_events[:10],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", default="78701")
    parser.add_argument("--procedure", default="")
    parser.add_argument("--insurance", default="")
    parser.add_argument("--cpt", default="")
    args = parser.parse_args()
    profile = build_profile(args)
    payload = query_prices(profile)
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
