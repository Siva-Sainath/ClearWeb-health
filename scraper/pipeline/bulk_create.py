"""
pipeline/bulk_create.py — Bulk-create Bright Data Scraper Studio collectors.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from collectors.brightdata import create_collector as bd_create_collector, wait_for_collector_ready
from db.store import init_db, insert_collector_job, collector_job_exists
from studio.prompts import infer_system

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CREATE_PROMPT = (
    "CMS hospital price transparency: open cms-hpt.txt or the hospital transparency page. "
    "Extract mrf-url and direct MRF/JSON/CSV/ZIP download links ONLY using collect(). "
    "Return fields: mrf_url, shoppable_services_csv_url, standard_charges_csv_url, or pricing_files[].file_url. "
    "Do NOT download file contents — URLs only."
)


class HospitalCandidate(TypedDict, total=False):
    name: str
    slug: str
    domain: str
    url: str
    city: str
    region: str
    system: str


def _hospital_dict(hospital: HospitalCandidate) -> dict:
    slug = hospital["slug"]
    return {
        "id": slug,
        "slug": slug,
        "name": hospital["name"],
        "domain": hospital.get("domain", ""),
        "url": hospital["url"],
        "price_transparency_page": hospital["url"],
        "system": hospital.get("system")
        or infer_system(hospital.get("domain", ""), slug, hospital["url"]),
    }


def create_collector(hospital: HospitalCandidate) -> str | None:
    """Create one BD collector; blocks until AI generation completes."""
    slug = hospital["slug"]
    url = hospital["url"]
    hosp = _hospital_dict(hospital)

    if collector_job_exists(slug):
        logger.info("[%s] Already in collector_jobs — skip", slug)
        return None

    logger.info(
        "[%s] Creating BD collector for %s (system=%s)",
        slug,
        url,
        hosp.get("system") or "generic",
    )
    max_attempts = int(os.environ.get("COLLECTOR_CREATE_RETRIES", "3"))
    cooldown = int(os.environ.get("COLLECTOR_CREATE_COOLDOWN_SEC", "90"))
    result = None
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            result = bd_create_collector(url, CREATE_PROMPT, name=slug, timeout=600, hospital=hosp)
            break
        except Exception as exc:
            last_exc = exc
            err = str(exc).lower()
            if "rate limit" in err or "429" in err or "error_limit" in err:
                wait = cooldown * attempt
                logger.warning("[%s] BD rate limit (attempt %d/%d) — waiting %ds", slug, attempt, max_attempts, wait)
                time.sleep(wait)
                continue
            logger.error("[%s] create failed: %s", slug, exc)
            return None
    if result is None:
        logger.error("[%s] create failed after %d attempts: %s", slug, max_attempts, last_exc)
        return None

    collector_id = result.get("collector_id")
    if not collector_id:
        logger.error("[%s] No collector_id in response: %s", slug, result)
        return None

    insert_collector_job(
        hospital_name=hospital["name"],
        slug=slug,
        domain=hospital.get("domain", ""),
        target_url=url,
        collector_id=collector_id,
    )
    logger.info("[%s] SUCCESS collector_id=%s — waiting for template", slug, collector_id)

    if os.environ.get("COLLECTOR_WAIT_FOR_TEMPLATE", "1") not in ("0", "false", "False"):
        wait_s = int(os.environ.get("COLLECTOR_TEMPLATE_WAIT_SEC", "600"))
        ready, reason = wait_for_collector_ready(collector_id, timeout_s=wait_s, poll_s=20)
        if not ready:
            logger.warning("[%s] Template not ready yet: %s (job stays pending)", slug, reason)

    return collector_id


def create_collectors_bulk(hospitals: list[HospitalCandidate]) -> list[str]:
    """Create collectors sequentially (each blocks ~2-10 min)."""
    init_db()
    created: list[str] = []
    for hosp in hospitals:
        cid = create_collector(hosp)
        if cid:
            created.append(cid)
        time.sleep(int(os.environ.get("COLLECTOR_INTER_CREATE_SEC", "30")))
    return created


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Bulk-create Bright Data scrapers")
    parser.add_argument("--batch", type=int, default=5)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument(
        "--candidates",
        type=str,
        default=str(ROOT / "data" / "texas_candidates.json"),
    )
    parser.add_argument("--skip-slug", action="append", default=[], help="Slugs to skip")
    args = parser.parse_args()

    candidates_path = Path(args.candidates)
    if not candidates_path.exists():
        logger.error("Candidates file not found: %s", candidates_path)
        sys.exit(1)

    skip = set(args.skip_slug)
    candidates: list[HospitalCandidate] = json.loads(candidates_path.read_text(encoding="utf-8"))
    batch = [c for c in candidates if c.get("slug") not in skip][: max(0, args.batch)]

    logger.info("Loaded %d candidates, batch=%d", len(candidates), len(batch))

    if args.dry_run or not args.execute:
        for c in batch:
            print(f"  [{c.get('slug')}] {c.get('name')} — {c.get('url')}")
        if not args.execute:
            print("Pass --execute to create collectors (consumes BD credits).")
        return

    ids = create_collectors_bulk(batch)
    print(f"\nCreated {len(ids)} collectors:")
    for cid in ids:
        print(f"  {cid}")
    print("\nNext: python sweep_collector_jobs.py")


if __name__ == "__main__":
    main()
