"""
pipeline/bulk_create.py — Bulk-create Bright Data Scraper Studio collectors.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from collectors.brightdata import create_collector as bd_create_collector
from db.store import init_db, insert_collector_job, collector_job_exists

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


def create_collector(hospital: HospitalCandidate) -> str | None:
    """Create one BD collector; blocks until AI generation completes."""
    slug = hospital["slug"]
    url = hospital["url"]

    if collector_job_exists(slug):
        logger.info("[%s] Already in collector_jobs — skip", slug)
        return None

    logger.info("[%s] Creating BD collector for %s", slug, url)
    try:
        result = bd_create_collector(url, CREATE_PROMPT, name=slug, timeout=600)
    except Exception as exc:
        logger.error("[%s] create failed: %s", slug, exc)
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
    logger.info("[%s] SUCCESS collector_id=%s", slug, collector_id)
    return collector_id


def create_collectors_bulk(hospitals: list[HospitalCandidate]) -> list[str]:
    """Create collectors sequentially (each blocks ~2-10 min)."""
    init_db()
    created: list[str] = []
    for hosp in hospitals:
        cid = create_collector(hosp)
        if cid:
            created.append(cid)
        time.sleep(2)
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
