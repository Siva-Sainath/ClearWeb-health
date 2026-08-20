"""Geocode hospital addresses via OpenStreetMap Nominatim (cached on disk)."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

CACHE_FILE = Path(__file__).parent / "data" / "geocode_cache.json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ClearwebHealth/1.0 (CMS price transparency demo)"


def _load_cache() -> dict[str, dict]:
    if not CACHE_FILE.exists():
        return {}
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_cache(cache: dict[str, dict]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def geocode_address(address: str) -> tuple[float, float] | None:
    """Return (lat, lng) for a street address, or None if geocoding fails."""
    key = address.strip().lower()
    if not key:
        return None

    cache = _load_cache()
    if key in cache:
        entry = cache[key]
        return entry.get("lat"), entry.get("lng")

    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"q": address, "format": "json", "limit": 1, "countrycodes": "us"},
            headers={"User-Agent": USER_AGENT},
            timeout=12,
        )
        resp.raise_for_status()
        results = resp.json()
        if not results:
            logger.warning("[geocode] No result for %s", address[:80])
            return None
        lat = float(results[0]["lat"])
        lng = float(results[0]["lon"])
        cache[key] = {"lat": lat, "lng": lng, "display_name": results[0].get("display_name", "")}
        _save_cache(cache)
        time.sleep(1.1)  # Nominatim usage policy: max 1 req/sec
        return lat, lng
    except Exception as exc:
        logger.warning("[geocode] Failed for %s: %s", address[:80], exc)
        return None
