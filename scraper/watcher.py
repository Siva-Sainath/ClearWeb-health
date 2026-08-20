#!/usr/bin/env python3
"""
watcher.py — Overnight batch pre-warm via Bright Data async collectors.

Uses Scraper Studio (async) + Web Unlocker downloads + Self-Healing on failure.
Live demo uses run_job.py (sync collectors).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT))

from collectors.unlocker import require_unlocker  # noqa: E402
from db.store import init_db, upsert_to_db  # noqa: E402
from discover import clear_collector_cache_entry, discover_mrf  # noqa: E402
from pipeline.heal import heal_collector, log_heal_event, reverify  # noqa: E402
from pipeline.ingest import download_file  # noqa: E402
from pipeline.normalize import normalize_file, TRACKED_CODES  # noqa: E402
from pipeline.validate import expected_for_cpt_codes, validate_output  # noqa: E402

WATCHER_LOG = ROOT / "data" / "watcher_log.jsonl"
WATCHER_ASYNC = os.environ.get("WATCHER_ASYNC", "1") not in ("0", "false", "False")
WATCHER_VALIDATION_SPEC = expected_for_cpt_codes(list(TRACKED_CODES))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("watcher")


def load_targets() -> list[dict]:
    with open(ROOT / "targets.yaml", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    return data.get("hospitals", [])


def append_log(record: dict) -> None:
    WATCHER_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(WATCHER_LOG, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")


def watchdog_pass(hospital: dict) -> str:
    """
    Run full detect → validate → heal → reverify loop for one hospital.
    Returns: healthy | healed | needs_manual_review | error
    """
    hid = hospital["id"]
    collector_id = hospital.get("collector_id") or ""
    system = hospital.get("system", "")
    t0 = time.monotonic()
    sync_mode = not WATCHER_ASYNC

    try:
        mrf_url, source, _ = discover_mrf(hospital, sync=sync_mode)
        raw_path = download_file(mrf_url, hid, system=system).path
        rows = normalize_file(
            raw_path,
            hospital_id=hid,
            format_hint=hospital.get("format_hint", "json"),
            source_url=mrf_url,
            filter_codes=TRACKED_CODES,
        )
        ok, reason = validate_output(rows, WATCHER_VALIDATION_SPEC)

        if ok:
            upsert_to_db(rows)
            status = "healthy"
            append_log({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "hospital_id": hid,
                "status": status,
                "source": source,
                "row_count": len(rows),
                "duration_s": round(time.monotonic() - t0, 1),
            })
            logger.info("[%s] HEALTHY — %d rows (%.1fs)", hid, len(rows), time.monotonic() - t0)
            return status

        logger.warning("[%s] VALIDATION FAILED: %s", hid, reason[:200])

        if not collector_id:
            append_log({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "hospital_id": hid,
                "status": "needs_manual_review",
                "reason": reason,
                "heal_attempted": False,
            })
            return "needs_manual_review"

        heal_prompt = (
            f"The collector failed validation for {hospital['name']}. "
            f"Specifically: {reason} "
            f"Return the direct CMS-compliant MRF download URL for this facility."
        )
        logger.info("[%s] BRIGHT DATA SELF-HEAL TRIGGERED", hid)
        from studio.prompts import enrich_heal_prompt

        heal_collector(
            collector_id,
            enrich_heal_prompt(hospital, reason, tier=1),
            auto_approve=True,
            hospital=hospital,
            tier=1,
        )
        clear_collector_cache_entry(collector_id)

        mrf_url2, source2, _ = discover_mrf(hospital, healed=True, sync=sync_mode)
        raw_path2 = download_file(mrf_url2, f"{hid}_healed", system=system, force_unlocker=True).path
        rows2 = normalize_file(
            raw_path2,
            hospital_id=hid,
            format_hint=hospital.get("format_hint", "json"),
            source_url=mrf_url2,
            filter_codes=TRACKED_CODES,
        )
        ok2 = reverify(collector_id, rows2, WATCHER_VALIDATION_SPEC)
        log_heal_event(collector_id, rows, rows2, reason, ok2)

        if ok2:
            upsert_to_db(rows2)
            status = "healed"
        else:
            status = "needs_manual_review"

        append_log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "hospital_id": hid,
            "status": status,
            "source": source2,
            "reason": reason,
            "heal_attempted": True,
            "heal_success": ok2,
            "row_count_after": len(rows2),
            "duration_s": round(time.monotonic() - t0, 1),
        })
        logger.info("[%s] %s after heal (%.1fs)", hid, status.upper(), time.monotonic() - t0)
        return status

    except Exception as exc:
        append_log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "hospital_id": hid,
            "status": "error",
            "error": str(exc),
            "duration_s": round(time.monotonic() - t0, 1),
        })
        logger.error("[%s] ERROR: %s", hid, exc)
        return "error"


def main() -> None:
    parser = argparse.ArgumentParser(description="Austin hospital scrape watcher (Bright Data async)")
    parser.add_argument("--interval", type=float, default=None, help="Hours between passes")
    parser.add_argument("--once", action="store_true", help="Run one pass and exit")
    parser.add_argument("--hospital", default="", help="Single hospital id")
    args = parser.parse_args()

    require_unlocker()

    interval_h = args.interval
    if interval_h is None:
        interval_h = float(os.environ.get("WATCHER_INTERVAL_HOURS", "6"))

    init_db()
    targets = load_targets()

    if args.hospital:
        targets = [t for t in targets if t["id"] == args.hospital]
        if not targets:
            sys.exit(f"Hospital not found: {args.hospital}")

    env_filter = os.environ.get("WATCHER_HOSPITAL_IDS", "")
    if env_filter:
        allowed = {x.strip() for x in env_filter.split(",") if x.strip()}
        targets = [t for t in targets if t["id"] in allowed]

    mode = "async" if WATCHER_ASYNC else "sync"
    logger.info("Watcher started — %d hospitals, interval %.1fh, BD collectors=%s", len(targets), interval_h, mode)
    logger.info("Log file: %s", WATCHER_LOG)

    while True:
        for hospital in targets:
            watchdog_pass(hospital)

        if args.once:
            break

        sleep_s = interval_h * 3600
        logger.info("Sleeping %.1fh until next pass ...", interval_h)
        time.sleep(sleep_s)


if __name__ == "__main__":
    main()
