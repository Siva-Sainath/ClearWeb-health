"""
sweep_collector_jobs.py
=======================
Checks the status of pending collector jobs, runs them,
validates output, and appends to targets.yaml if successful.
"""
import logging
import subprocess
import json
import sys
import yaml
from pathlib import Path

from db.store import get_pending_collector_jobs, update_collector_job_status, count_verified_collectors
from pipeline.heal import validate_preview

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent
TARGETS_PATH = ROOT / "targets.yaml"


def add_to_targets(job: dict) -> None:
    """Append a verified hospital entry to targets.yaml hospitals array."""
    slug = job["slug"]
    if not TARGETS_PATH.exists():
        data: dict = {"hospitals": []}
    else:
        with open(TARGETS_PATH, "r", encoding="utf-8") as f:
            try:
                data = yaml.safe_load(f) or {}
            except yaml.YAMLError:
                data = {}

    hospitals = data.setdefault("hospitals", [])
    if any(h.get("id") == slug or h.get("collector_name") == slug for h in hospitals):
        logger.info(f"[{slug}] Already exists in targets.yaml")
        return

    hospitals.append({
        "id": slug,
        "name": job.get("hospital_name", slug),
        "collector_name": slug,
        "homepage": job.get("target_url", ""),
        "price_transparency_page": job.get("target_url", ""),
        "format_hint": "json",
        "collector_id": job["collector_id"],
        "domain": job.get("domain", ""),
    })
    with open(TARGETS_PATH, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
    logger.info(f"[{slug}] Added to targets.yaml")


def run_scraper(collector_id: str, target_url: str) -> list[dict] | None | str:
    """Run the newly created scraper against the target URL to validate it. Returns 'building' if it's not ready."""
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    cmd = [
        npx, "-y", "-p", "@brightdata/cli",
        "bdata", "scraper", "run",
        collector_id, target_url, "--json"
    ]
    logger.info(f"Running scraper {collector_id} on {target_url}...")
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    combined_output = p.stdout + p.stderr
    if "Collector does not have a template" in combined_output or "AI generation has not completed" in combined_output:
        logger.info(f"Scraper {collector_id} is still building. Skipping for now.")
        return "building"

    stdout = p.stdout.strip()
    if not stdout:
        logger.error(f"Scraper run {collector_id} returned empty stdout.")
        return None

    try:
        parsed = json.loads(stdout)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass

    start_idx = stdout.find('[')
    if start_idx != -1:
        try:
            parsed = json.loads(stdout[start_idx:])
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    for line in reversed(stdout.split('\n')):
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict) and "error" in parsed:
                logger.error(f"Scraper run returned error: {parsed}")
                return None
        except json.JSONDecodeError:
            pass

    logger.error(f"Failed to parse JSON from scraper run {collector_id}. Output was: {stdout[:500]}")
    return None


def sweep():
    jobs = get_pending_collector_jobs()
    if not jobs:
        logger.info("No pending jobs to sweep.")
        return

    logger.info(f"Sweeping {len(jobs)} pending jobs...")

    for job in jobs:
        collector_id = job["collector_id"]
        slug = job["slug"]
        url = job["target_url"]
        logger.info(f"[{slug}] Validating collector {collector_id}")

        payload = run_scraper(collector_id, url)

        if payload == "building":
            continue

        ok, reason = validate_preview(payload)

        if ok:
            logger.info(f"[{slug}] SUCCESS: {reason or 'preview valid'}")
            update_collector_job_status(collector_id, "verified", "Passed validation")
            add_to_targets(job)
        else:
            logger.warning(f"[{slug}] FAILED: {reason}")
            update_collector_job_status(collector_id, "failed", reason)

    verified = count_verified_collectors()
    logger.info(f"Sweep complete. Total verified collectors: {verified}/10")


if __name__ == "__main__":
    sweep()
