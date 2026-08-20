"""
collectors/unlocker.py — Bright Data Web Unlocker API.

All external page/file fetches go through Web Unlocker (hackathon requirement).
Scraper Studio collectors handle portal navigation; Unlocker handles raw URL bytes.

Docs: https://docs.brightdata.com/scraping-automation/web-unlocker/send-your-first-request.md
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

UNLOCKER_API = "https://api.brightdata.com/request"


def unlocker_zone() -> str:
    return (
        os.environ.get("BRIGHTDATA_UNLOCKER_ZONE", "")
        or os.environ.get("BRIGHT_DATA_UNLOCKER_ZONE", "")
    ).strip()


def unlocker_available() -> bool:
    key = os.environ.get("BRIGHTDATA_API_KEY", "")
    zone = unlocker_zone()
    return bool(key and zone and key != "your_brightdata_api_key_here")


def require_unlocker() -> None:
    """Fail fast when Web Unlocker is not configured (required for BD-sponsored demo)."""
    if not unlocker_available():
        raise EnvironmentError(
            "Bright Data Web Unlocker is required. Set BRIGHTDATA_API_KEY and "
            "BRIGHTDATA_UNLOCKER_ZONE in scraper/.env — create a zone at "
            "https://brightdata.com/cp/zones"
        )


def use_unlocker_for_download(*, force: bool = False) -> bool:
    """All MRF downloads route through Web Unlocker when configured."""
    if force:
        return unlocker_available()
    if os.environ.get("BRIGHTDATA_USE_UNLOCKER_ALL", "1") in ("0", "false", "False"):
        return False
    return unlocker_available()


def fetch_bytes(url: str, *, timeout: int = 900) -> bytes:
    """Download raw bytes via Web Unlocker direct API (format=raw)."""
    require_unlocker()
    api_key = os.environ.get("BRIGHTDATA_API_KEY", "")
    zone = unlocker_zone()

    logger.info("[unlocker] Fetching via zone=%s url=%s…", zone, url[:100])
    resp = requests.post(
        UNLOCKER_API,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={"zone": zone, "url": url, "format": "raw"},
        timeout=timeout,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Web Unlocker HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.content
    if len(data) < 64:
        snippet = data.decode("utf-8", errors="replace")
        raise RuntimeError(f"Web Unlocker returned empty/error response: {snippet[:200]}")

    logger.info("[unlocker] Got %s bytes", f"{len(data):,}")
    return data


def fetch_text(url: str, *, timeout: int = 120) -> str:
    """Fetch page text/HTML via Web Unlocker (used for CMS index / portal fallback discovery)."""
    data = fetch_bytes(url, timeout=timeout)
    return data.decode("utf-8", errors="replace")
