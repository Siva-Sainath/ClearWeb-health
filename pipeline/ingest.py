"""
pipeline/ingest.py
==================
Step 2 — Download the MRF file to disk via plain HTTP GET (no Bright Data credits).

Uses chunked streaming so large files (this hospital's MRF is ~606 MB) don't blow up RAM.
Downloaded files land in data/raw/ with a timestamped filename for traceability.
"""

import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

# Raw downloads directory (relative to repo root)
RAW_DIR = Path(__file__).parent.parent / "data" / "raw"

# Chunk size for streaming download — 8 MB per chunk
CHUNK_SIZE = 8 * 1024 * 1024


def download_file(url: str, hospital_id: str) -> Path:
    """
    Stream-download the MRF file at `url` to data/raw/<hospital_id>_<timestamp>.json.

    Returns the Path to the downloaded file.
    Raises requests.HTTPError on HTTP errors.
    Raises RuntimeError if the file is suspiciously small (< 1 KB — likely an error page).
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    # Use a timestamp + hospital_id filename so multiple runs don't clobber each other
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = _guess_suffix(url)
    dest = RAW_DIR / f"{hospital_id}_{ts}{suffix}"

    logger.info(f"[ingest] Downloading MRF for {hospital_id} → {dest}")
    logger.info(f"[ingest] URL: {url[:120]}...")

    headers = {
        "User-Agent": "ChargemasterRadar/1.0 (hackathon; research; contact: see repo)",
    }

    bytes_downloaded = 0
    hasher = hashlib.md5()

    with requests.get(url, headers=headers, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("Content-Length", 0))
        logger.info(f"[ingest] Content-Length: {total:,} bytes" if total else "[ingest] Content-Length: unknown")

        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=CHUNK_SIZE):
                if chunk:
                    fh.write(chunk)
                    hasher.update(chunk)
                    bytes_downloaded += len(chunk)
                    if total:
                        pct = bytes_downloaded / total * 100
                        logger.debug(f"[ingest]   {bytes_downloaded:,} / {total:,} bytes ({pct:.1f}%)")

    if bytes_downloaded < 1024:
        raise RuntimeError(
            f"Downloaded file is only {bytes_downloaded} bytes — likely an error page, not the real MRF.\n"
            f"URL: {url}\nDest: {dest}"
        )

    logger.info(f"[ingest] Done. {bytes_downloaded:,} bytes, MD5={hasher.hexdigest()} → {dest.name}")
    return dest


def _guess_suffix(url: str) -> str:
    """Extract file extension from URL path, default to .json."""
    path = url.split("?")[0]  # strip query string / SAS token
    name = path.rsplit("/", 1)[-1]
    if "." in name:
        return "." + name.rsplit(".", 1)[-1].lower()
    return ".json"
