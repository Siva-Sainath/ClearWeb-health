"""
scripts/collector_loop.py — Run pending BD collectors with self-heal.

  1. Check collector template ready (skip if still building / no template)
  2. Run collector (async by default — avoids 50s sync timeout)
  3. validate_preview(output)
  4. If fail → heal_collector (REST fallback on heal_trigger_failed)
  5. Re-run → validate
  6. On success → verified + targets.yaml

Env:
  COLLECTOR_USE_SYNC=1     — force 50s sync runs (demo only)
  BRIGHTDATA_ASYNC_TIMEOUT — async poll seconds (default 300)
  HEAL_MAX_WAIT_SEC        — heal CLI wait (default 900)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from db.store import (
    get_pending_collector_jobs,
    update_collector_job_status,
    count_verified_collectors,
    reset_collector_jobs_to_pending,
)
from collectors.brightdata import run_collector, collector_ready
from pipeline.heal import validate_preview, heal_collector, log_heal_event
from sweep_collector_jobs import add_to_targets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

USE_SYNC = os.environ.get("COLLECTOR_USE_SYNC", "0") in ("1", "true", "True")
HEAL_COOLDOWN_SEC = int(os.environ.get("HEAL_COOLDOWN_SEC", "45"))


def _coerce_to_list(raw) -> list[dict] | None:
    if raw is None:
        return None
    if isinstance(raw, list):
        return raw if raw else None
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return _coerce_to_list(parsed)
        except json.JSONDecodeError:
            return None
    return None


def _run_and_validate(collector_id: str, url: str, attempt: int) -> tuple[bool, str, list[dict] | None]:
    label = f"[{collector_id}] attempt={attempt}"
    mode = "sync" if USE_SYNC else "async"
    logger.info(f"{label} Running ({mode}) collector {collector_id} url={url[:80]}")
    try:
        raw = run_collector(collector_id, seed_url=url, sync=USE_SYNC)
    except RuntimeError as exc:
        err = str(exc)
        logger.error(f"{label} run_collector raised: {err[:300]}")
        if "building" in err.lower() or "not completed" in err.lower():
            return False, "collector_still_building", None
        if "does not have a template" in err.lower():
            return False, "no_template", None
        return False, err[:400], None

    result = _coerce_to_list(raw)
    ok, reason = validate_preview(result)
    status_str = "PASS" if ok else "FAIL"
    logger.info(f"{label} validate_preview -> {status_str}: {reason or '(valid)'}")
    return ok, reason, result


def process_job(job: dict, *, dry_run: bool = False) -> bool:
    collector_id: str = job["collector_id"]
    slug: str = job["slug"]
    url: str = job.get("target_url", "")
    hospital_name: str = job.get("hospital_name", slug)

    logger.info(
        f"{'[DRY-RUN] ' if dry_run else ''}Processing job: {slug} | collector={collector_id}"
    )
    if dry_run:
        return False

    ready, ready_reason = collector_ready(collector_id)
    if not ready:
        logger.warning(f"[{slug}] Not ready: {ready_reason}")
        if "template" in ready_reason.lower():
            update_collector_job_status(collector_id, "failed", ready_reason)
            return False
        update_collector_job_status(collector_id, "pending", ready_reason)
        return False

    ok, reason, result = _run_and_validate(collector_id, url, attempt=1)
    if ok:
        logger.info(f"[{slug}] First run passed. Marking verified.")
        update_collector_job_status(collector_id, "verified", "Passed validation on first run")
        add_to_targets(job)
        return True

    if reason in ("collector_still_building", "no_template"):
        logger.warning(f"[{slug}] {reason} — leave pending for retry or manual recreate.")
        update_collector_job_status(
            collector_id,
            "pending" if reason == "collector_still_building" else "failed",
            reason,
        )
        return False

    logger.info(f"[{slug}] First run failed ({reason[:120]}). Initiating heal...")
    before_sample = (result or [])[:5]
    try:
        heal_result = heal_collector(
            collector_id,
            reason=reason,
            hospital={"id": slug, "name": hospital_name},
            auto_approve=True,
        )
        heal_status = heal_result.get("status", "unknown")
        logger.info(f"[{slug}] heal status={heal_status!r} approved={heal_result.get('approved')}")
        if heal_status == "heal_rest_triggered":
            logger.info(f"[{slug}] Waiting {HEAL_COOLDOWN_SEC}s after REST heal...")
            time.sleep(HEAL_COOLDOWN_SEC)
    except RuntimeError as exc:
        logger.error(f"[{slug}] heal_collector failed: {exc}")
        log_heal_event(collector_id, before_sample, [], str(exc)[:400], False)
        update_collector_job_status(collector_id, "failed", f"heal error: {str(exc)[:300]}")
        return False

    ok2, reason2, result2 = _run_and_validate(collector_id, url, attempt=2)
    log_heal_event(collector_id, before_sample, (result2 or [])[:5], reason[:400], ok2)

    if ok2:
        logger.info(f"[{slug}] Second run passed after heal. Marking verified.")
        update_collector_job_status(collector_id, "verified", "Passed validation after heal")
        add_to_targets(job)
        return True

    logger.warning(f"[{slug}] Second run still failed: {reason2[:200]}")
    update_collector_job_status(collector_id, "failed", f"Still failed after heal: {reason2[:300]}")
    return False


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Collector run-verify-heal loop")
    parser.add_argument("--max", type=int, default=0, help="Max jobs (0 = all pending)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--retry-failed", action="store_true", help="Reset failed → pending first")
    args = parser.parse_args(argv)

    if args.retry_failed:
        n = reset_collector_jobs_to_pending()
        logger.info(f"Reset {n} failed job(s) to pending")

    jobs = get_pending_collector_jobs()
    if not jobs:
        logger.info("No pending collector jobs found.")
        return

    if args.max and args.max > 0:
        jobs = jobs[: args.max]

    if args.dry_run:
        for i, job in enumerate(jobs, 1):
            print(f"{i}. {job.get('slug')} {job.get('collector_id')} {job.get('target_url', '')[:60]}")
        return

    verified = failed = 0
    for i, job in enumerate(jobs, 1):
        logger.info(f"--- [{i}/{len(jobs)}] {job.get('slug')} ---")
        if process_job(job):
            verified += 1
        else:
            failed += 1

    logger.info(
        f"Loop complete — verified={verified}, failed={failed} | "
        f"total verified in DB: {count_verified_collectors()}"
    )


if __name__ == "__main__":
    main()
