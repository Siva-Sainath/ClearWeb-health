"""
run_pipeline.py
===============
End-to-end orchestrator for Hospital #1: HCA Houston Healthcare Medical Center.

Pipeline steps:
  1. Discover  — run the pre-verified Bright Data collector to get the live MRF URL.
                 Falls back to mrf_seed_url if the collector call fails.
  2. Ingest    — stream-download the MRF file to data/raw/ (plain HTTP, no BD credits).
  3. Normalize — parse the CMS-compliant JSON into the shared schema (streaming via ijson).
  4. Validate  — check for empty output, missing prices, expected CPTs, price ranges.
  5. Persist   — upsert passing rows into SQLite (data/chargemaster.db).
  6. Confirm   — print a sample curl command + summary so you can verify the round-trip.

Step 8 heal functions (heal_collector, reverify, log_heal_event) are NOT wired here.
They live in pipeline/heal.py, callable manually once step 7 is confirmed on video.

Usage:
    python run_pipeline.py
    python run_pipeline.py --skip-download data/raw/hca_houston_medical_center_20260819T...json
"""

import argparse
import logging
import sys
import time
from pathlib import Path

import yaml

# ── project-level imports ────────────────────────────────────────────────────
from collectors.brightdata import run_collector
from db.store import get_row_count, get_rows_for_hospital, init_db, upsert_to_db
from pipeline.ingest import download_file
from pipeline.normalize import normalize_file
from pipeline.validate import EXPECTED_PROCEDURES, validate_output

# ── logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pipeline")

TARGETS_FILE = Path(__file__).parent / "targets.yaml"
TARGET_HOSPITAL_ID = "hca_houston_medical_center"


# ── helpers ───────────────────────────────────────────────────────────────────

def load_target(hospital_id: str) -> dict:
    """Load a hospital spec from targets.yaml by id."""
    with open(TARGETS_FILE, encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    for hospital in data.get("hospitals", []):
        if hospital["id"] == hospital_id:
            return hospital
    raise KeyError(f"Hospital '{hospital_id}' not found in {TARGETS_FILE}")


def banner(msg: str) -> None:
    logger.info("=" * 60)
    logger.info(f"  {msg}")
    logger.info("=" * 60)


# ── pipeline steps ────────────────────────────────────────────────────────────

def step1_discover(hospital: dict, use_seed: bool = False) -> str:
    """
    Get the current live MRF URL.

    If use_seed=True (or --use-seed flag), skip the collector call entirely and
    use mrf_seed_url directly — useful before BRIGHTDATA_API_KEY is set.

    Otherwise: run the pre-verified Bright Data collector; fall back to seed
    if the CLI is unavailable or returns no URL.

    Returns the MRF URL string.
    """
    banner("STEP 1 — Discover")
    seed_url = hospital["mrf_seed_url"]
    collector_id = hospital.get("collector_id")

    if use_seed:
        logger.info("[step1] --use-seed: skipping collector, using mrf_seed_url directly")
        logger.info(f"[step1] URL: {seed_url[:120]}…")
        return seed_url

    if not collector_id:
        logger.warning("[step1] No collector_id in targets.yaml — using seed URL directly")
        return seed_url

    logger.info(f"[step1] Collector ID: {collector_id}")
    try:
        seed = hospital.get("price_transparency_page") or hospital["homepage"]
        result = run_collector(collector_id, seed, hospital["name"])
        logger.info(f"[step1] RAW COLLECTOR OUTPUT: {result}")
        mrf_url = result.get("mrf_url", "")
        if mrf_url:
            logger.info(f"[step1] Live URL from collector: {mrf_url[:100]}…")
            return mrf_url
        else:
            logger.warning("[step1] Collector returned no mrf_url — falling back to seed URL")
    except (RuntimeError, EnvironmentError) as exc:
        logger.warning(
            f"[step1] Collector call failed ({exc.__class__.__name__}: {exc})\n"
            "        → Falling back to mrf_seed_url from targets.yaml"
        )

    logger.info(f"[step1] Using seed URL: {seed_url[:100]}…")
    return seed_url


def step2_ingest(mrf_url: str, hospital_id: str, skip_to: Path | None, no_unlocker: bool = False) -> Path:
    """
    Download the MRF file to disk. If --skip-download was passed, use that path instead.
    Returns the Path to the local file.
    """
    banner("STEP 2 — Ingest (download MRF file)")
    if skip_to:
        logger.info(f"[step2] --skip-download: using existing file {skip_to}")
        if not skip_to.exists():
            raise FileNotFoundError(f"--skip-download path does not exist: {skip_to}")
        return skip_to

    return download_file(mrf_url, hospital_id, no_unlocker=no_unlocker).path


def step3_normalize(raw_path: Path, hospital: dict, mrf_url: str) -> list[dict]:
    """Parse the raw MRF file into the shared schema."""
    banner("STEP 3 — Normalize")
    rows = normalize_file(
        raw_path=raw_path,
        hospital_id=hospital["id"],
        format_hint=hospital.get("format_hint", "json"),
        source_url=mrf_url,
    )
    logger.info(f"[step3] {len(rows):,} rows produced")
    if rows:
        sample = rows[0]
        logger.info(
            f"[step3] Sample row → code={sample['procedure_code']}  "
            f"payer={sample['payer']!r}  price=${sample['price']:.2f}  "
            f"type={sample['price_type']}"
        )
    return rows


def step4_validate(rows: list[dict]) -> tuple[bool, str]:
    """Run all validation checks."""
    banner("STEP 4 — Validate")
    ok, reason = validate_output(rows, EXPECTED_PROCEDURES)
    if ok:
        logger.info("[step4] ✓ VALIDATION PASSED")
    else:
        logger.error(f"[step4] ✗ VALIDATION FAILED\n         Reason: {reason}")
    return ok, reason


def step5_persist(rows: list[dict]) -> int:
    """Upsert rows into SQLite."""
    banner("STEP 5 — Persist to DB")
    count = upsert_to_db(rows)
    hospital_id = rows[0]["hospital_id"] if rows else None
    total = get_row_count(hospital_id)
    logger.info(f"[step5] {count:,} rows upserted. Total in DB for '{hospital_id}': {total:,}")
    return count


def step6_confirm(hospital_id: str) -> None:
    """Print a sample of what's in the DB + the curl command to verify via API."""
    banner("STEP 6 — Confirm round-trip")
    sample_rows = get_rows_for_hospital(hospital_id)[:5]
    if sample_rows:
        logger.info("[step6] First 5 rows from DB:")
        for r in sample_rows:
            logger.info(
                f"         {r['procedure_code']:8s}  {r['procedure_name'][:40]:40s}  "
                f"{r['payer'][:30]:30s}  ${r['price']:>10.2f}  {r['price_type']}"
            )
    else:
        logger.warning("[step6] No rows found in DB — something went wrong with the upsert")

    logger.info("")
    logger.info("[step6] To verify via API, start the server and run:")
    logger.info(f"         uvicorn api.main:app --reload")
    logger.info(f'         curl "http://localhost:8000/hospitals/{hospital_id}/prices?limit=5"')
    logger.info(f'         curl "http://localhost:8000/hospitals/{hospital_id}/prices?procedure_code=70553"')
    logger.info(f'         curl "http://localhost:8000/hospitals/{hospital_id}/summary"')
    logger.info("")
    logger.info("[step6] Or check the DB directly:")
    logger.info(f"         python -c \"from db.store import get_rows_for_hospital; "
                f"import json; print(json.dumps(get_rows_for_hospital('{hospital_id}')[:3], indent=2))\"")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Chargemaster Radar — Hospital #1 pipeline")
    parser.add_argument(
        "--skip-download",
        metavar="PATH",
        help="Skip download and use an already-downloaded MRF file at PATH",
    )
    parser.add_argument(
        "--use-seed",
        action="store_true",
        help="Skip the Bright Data collector call and use mrf_seed_url directly",
    )
    parser.add_argument(
        "--hospital-id",
        default=TARGET_HOSPITAL_ID,
        help=f"Hospital ID to process (default: {TARGET_HOSPITAL_ID})",
    )
    parser.add_argument(
        "--no-unlocker",
        action="store_true",
        help="Skip Bright Data Web Unlocker and use direct requests.get()",
    )
    args = parser.parse_args()

    t_start = time.monotonic()
    hospital_id = args.hospital_id
    skip_path = Path(args.skip_download) if args.skip_download else None

    logger.info(f"Chargemaster Radar — pipeline run for '{hospital_id}'")

    # Initialise DB
    init_db()

    # Load target spec
    try:
        hospital = load_target(hospital_id)
    except KeyError as exc:
        logger.error(str(exc))
        sys.exit(1)

    # Step 1 — Discover
    mrf_url = step1_discover(hospital, use_seed=args.use_seed)

    # Step 2 — Ingest
    raw_path = step2_ingest(mrf_url, hospital_id, skip_path, no_unlocker=args.no_unlocker)

    # Step 3 — Normalize
    rows = step3_normalize(raw_path, hospital, mrf_url)

    # Step 4 — Validate
    ok, reason = step4_validate(rows)

    if not ok:
        logger.error(
            "\n\n  Pipeline STOPPED — validation failed.\n"
            "  Fix the issue or trigger heal_collector() manually:\n"
            "      from pipeline.heal import heal_collector\n"
            f"      heal_collector('{hospital.get('collector_id', '<id>')}',\n"
            f"                     reason={reason!r},\n"
            f"                     auto_approve=True)\n"
        )
        sys.exit(2)

    # Step 5 — Persist
    step5_persist(rows)

    # Step 6 — Confirm
    step6_confirm(hospital_id)

    elapsed = time.monotonic() - t_start
    logger.info(f"\n  Pipeline complete in {elapsed:.1f}s ✓")


if __name__ == "__main__":
    main()
