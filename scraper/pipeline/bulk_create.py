"""
pipeline/bulk_create.py
=======================
Bulk creates Bright Data scrapers asynchronously.
"""

import logging
import re
import subprocess
import sys
import time
from typing import TypedDict
import json

from db.store import insert_collector_job, collector_job_exists

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

class HospitalCandidate(TypedDict):
    name: str
    slug: str
    domain: str
    url: str


def create_collector(hospital: HospitalCandidate) -> tuple[str | None, subprocess.Popen | None]:
    """
    Fires off a bdata scraper create command asynchronously.
    Reads the first few lines of stdout to parse the collector_id,
    logs it to the DB, and returns the ID and the Popen process.
    """
    slug = hospital["slug"]
    url = hospital["url"]
    
    if collector_job_exists(slug):
        logger.info(f"[{slug}] Job already exists in DB. Skipping creation.")
        return None, None
    
    logger.info(f"[{slug}] Firing create_collector for {url}")

    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    # Using the correct syntax: bdata scraper create <url> <description> --name <slug> --json
    cmd = [
        npx, "-y", "-p", "@brightdata/cli",
        "bdata", "scraper", "create",
        url,
        "Extract the price transparency machine-readable file URLs from this page. Do NOT navigate to or download the CSV/JSON files themselves — only return their URLs as data using collect({product_page_url: url}) for each one found. The output should be a list of links, not file contents.",
        "--name", slug,
        "--json"
    ]

    p = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8"
    )

    collector_id = None
    regex = re.compile(r"Template created:\s*(c_[a-z0-9]+)")

    # Read the first 15 lines looking for the Template ID
    # Note: we use a bounded loop to avoid blocking indefinitely if the format changes
    for _ in range(15):
        line = p.stdout.readline()
        if not line:
            break
        line = line.strip()
        logger.debug(f"[{slug}] CLI: {line}")
        
        match = regex.search(line)
        if match:
            collector_id = match.group(1)
            break
            
    if collector_id:
        logger.info(f"[{slug}] Captured collector_id: {collector_id}")
        
        # Drain the rest of the stdout in a background thread to prevent pipe deadlock
        import threading
        def drain():
            for _ in p.stdout:
                pass
        threading.Thread(target=drain, daemon=True).start()
        
        insert_collector_job(
            hospital_name=hospital["name"],
            slug=slug,
            domain=hospital["domain"],
            target_url=url,
            collector_id=collector_id
        )
    else:
        logger.error(f"[{slug}] Failed to capture collector_id from CLI output. Process might have failed.")
        # We leave the process running or it might have crashed.

    return collector_id, p


def create_collectors_bulk(hospitals: list[HospitalCandidate]) -> None:
    """
    Iterates through the list of hospitals and fires off creations sequentially.
    Because create_collector returns as soon as the ID is parsed, this fires off
    all builds in rapid succession, letting them build in parallel in the background.
    """
    logger.info(f"Starting bulk creation for {len(hospitals)} candidates...")
    
    processes = []
    for hosp in hospitals:
        cid, p = create_collector(hosp)
        if p:
            processes.append((hosp["slug"], p))
        # Small delay to avoid slamming the Bright Data CLI/API in exactly the same millisecond
        time.sleep(1)
        
    logger.info(f"Bulk creation initialized. {len(processes)} candidates are now building.")
    logger.info("Waiting for all AI generation child processes to complete...")
    
    for slug, p in processes:
        p.wait()
        logger.info(f"[{slug}] AI generation CLI process finished with code {p.returncode}.")
        
    logger.info("All parallel AI generation builds have completed!")

if __name__ == "__main__":
    # Test block
    pass
