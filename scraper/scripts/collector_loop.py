"""
scripts/collector_loop.py
=========================
Hackathon loop: for each pending collector_job in the DB:

  1. Run:   bdata scraper run <c_id> <url> --sync --sync-timeout 50
  2. Validate: validate_preview(output)
  3. If fail → heal_collector(auto_approve=True) → auto-approve if awaiting
  4. Re-run  → validate again
  5. On success → update_collector_job status=verified, append targets.yaml

Reuses:
  collectors/brightdata.py  — run_collector()
  pipeline/heal.py          — validate_preview(), heal_collector()
  sweep_collector_jobs.py   — add_to_targets()
  db/store.py               — get_pending_collector_jobs(), update_collector_job_status()

CLI
---
  python scripts/collector_loop.py           # process all pending jobs
  python scripts/collector_loop.py --max 3   # cap at 3 jobs
  python scripts/collector_loop.py --dry-run # list pending jobs, do nothing
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Path fix: make sure the repo root is on sys.path so sibling packages import.
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from db.store import (
    get_pending_collector_jobs,
    update_collector_job_status,
    count_verified_collectors,
)
from collectors.brightdata import run_collector
from pipeline.heal import validate_preview, heal_collector
from sweep_collector_jobs import add_to_targets  # reuse targets.yaml helper

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _coerce_to_list(raw) -> list[dict] | None:
    """Normalise run_collector() output to list[dict] for validate_preview()."""
    if raw is None:
        return None
    if isinstance(raw, list):
        return raw if raw else None
    if isinstance(raw, dict):
        # Single record returned
        return [raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return _coerce_to_list(parsed)
        except json.JSONDecodeError:
            return None
    return None


def _run_and_validate(collector_id: str, url: str, attempt: int) -> tuple[bool, str, list[dict] | None]:
    """
    Run collector, parse output, validate preview.

    Returns (ok, reason, result_list).
    """
    label = f"[{collector_id}] attempt={attempt}"
    logger.info(f"{label} Running bdata scraper run {collector_id} {url} --sync --sync-timeout 50")
    try:
        raw = run_collector(collector_id, seed_url=url, sync=True)
    except RuntimeError as exc:
        err = str(exc)
        logger.error(f"{label} run_collector raised: {err[:300]}")
        if "building" in err.lower() or "not completed" in err.lower():
            return False, "collector_still_building", None
        return False, err[:400], None

    result = _coerce_to_list(raw)
    ok, reason = validate_preview(result)
    status_str = "PASS" if ok else "FAIL"
    logger.info(f"{label} validate_preview -> {status_str}: {reason or '(valid)'}")
    return ok, reason, result


# ---------------------------------------------------------------------------
# Core loop
# ---------------------------------------------------------------------------

def process_job(job: dict, *, dry_run: bool = False) -> bool:
    """
    Run the full create-run-verify loop for one collector_job row.

    Returns True if the job ended as 'verified'.
    """
    collector_id: str = job["collector_id"]
    slug: str = job["slug"]
    url: str = job.get("target_url", "")
    hospital_name: str = job.get("hospital_name", slug)

    logger.info(
        f"{'[DRY-RUN] ' if dry_run else ''}Processing job: {slug} "
        f"| collector={collector_id} | url={url}"
    )

    if dry_run:
        return False  # list only — do not execute

    # ------------------------------------------------------------------
    # STEP 1 + 2: First run + validate
    # ------------------------------------------------------------------
    ok, reason, result = _run_and_validate(collector_id, url, attempt=1)

    if ok:
        # Fast path: already good → mark verified
        logger.info(f"[{slug}] First run passed. Marking verified.")
        update_collector_job_status(collector_id, "verified", "Passed validation on first run")
        add_to_targets(job)
        return True

    # ------------------------------------------------------------------
    # STEP 3: Heal
    # ------------------------------------------------------------------
    if reason == "collector_still_building":
        logger.warning(f"[{slug}] Collector still building — skipping heal, will retry next sweep.")
        update_collector_job_status(collector_id, "pending", "collector still building")
        return False

    logger.info(f"[{slug}] First run failed ({reason[:120]}). Initiating heal...")
    try:
        heal_result = heal_collector(
            collector_id,
            reason=reason,
            hospital={"id": slug, "name": hospital_name},
            auto_approve=True,
        )
        heal_status = heal_result.get("status", "unknown")
        approved = heal_result.get("approved", None)
        logger.info(
            f"[{slug}] heal_collector returned status={heal_status!r}, approved={approved}"
        )
    except RuntimeError as exc:
        logger.error(f"[{slug}] heal_collector failed: {exc}")
        update_collector_job_status(collector_id, "failed", f"heal error: {str(exc)[:300]}")
        return False

    # ------------------------------------------------------------------
    # STEP 4: Re-run + re-validate after heal
    # ------------------------------------------------------------------
    ok2, reason2, result2 = _run_and_validate(collector_id, url, attempt=2)

    if ok2:
        # ------------------------------------------------------------------
        # STEP 5: Mark verified + append targets.yaml
        # ------------------------------------------------------------------
        logger.info(f"[{slug}] Second run passed after heal. Marking verified.")
        update_collector_job_status(collector_id, "verified", "Passed validation after heal")
        add_to_targets(job)
        return True
    else:
        logger.warning(f"[{slug}] Second run still failed: {reason2[:200]}")
        update_collector_job_status(
            collector_id,
            "failed",
            f"Still failed after heal: {reason2[:300]}",
        )
        return False


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Collector create-run-verify hackathon loop.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python scripts/collector_loop.py            # process all pending\n"
            "  python scripts/collector_loop.py --max 3    # cap at 3 jobs\n"
            "  python scripts/collector_loop.py --dry-run  # list pending, no-op\n"
        ),
    )
    parser.add_argument(
        "--max",
        type=int,
        default=0,
        metavar="N",
        help="Maximum number of pending jobs to process (0 = no limit).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print pending jobs without running anything.",
    )
    args = parser.parse_args(argv)

    # ------------------------------------------------------------------
    # Fetch pending jobs
    # ------------------------------------------------------------------
    jobs = get_pending_collector_jobs()

    if not jobs:
        logger.info("No pending collector jobs found.")
        return

    logger.info(f"Found {len(jobs)} pending collector job(s).")

    if args.max and args.max > 0:
        jobs = jobs[: args.max]
        logger.info(f"Capped to --max {args.max} job(s).")

    if args.dry_run:
        print("\n[DRY-RUN] Pending collector jobs:")
        print(f"  {'#':<4} {'slug':<40} {'collector_id':<20} target_url")
        print(f"  {'-'*4} {'-'*40} {'-'*20} {'-'*50}")
        for i, job in enumerate(jobs, start=1):
            print(
                f"  {i:<4} {job.get('slug', ''):<40} "
                f"{job.get('collector_id', ''):<20} {job.get('target_url', '')}"
            )
        print(f"\nTotal pending: {len(jobs)}\n")
        return

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------
    verified = 0
    failed = 0

    for i, job in enumerate(jobs, start=1):
        slug = job.get("slug", f"job-{i}")
        logger.info(f"--- [{i}/{len(jobs)}] {slug} ---")
        success = process_job(job, dry_run=False)
        if success:
            verified += 1
        else:
            failed += 1

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    total_verified = count_verified_collectors()
    logger.info(
        f"Loop complete — this run: verified={verified}, failed={failed} | "
        f"Total verified in DB: {total_verified}"
    )


if __name__ == "__main__":
    main()
