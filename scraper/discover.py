"""
discover.py — Resolve live MRF URLs via Bright Data products only.

  1. Scraper Studio collector (primary) — portal navigation
  2. Web Unlocker + parse (fallback) — fetch CMS index / portal HTML
  3. Self-heal re-runs collector (see run_job.py / watcher.py)
"""

from __future__ import annotations

import html
import logging
import re
import threading

from collectors.brightdata import run_collector
from collectors.unlocker import fetch_text, unlocker_available
from pipeline.ingest import has_valid_disk_cache

logger = logging.getLogger(__name__)

HCA_PORTAL = (
    "https://www.stdavids.com/patient-resources/patient-financial-resources/"
    "pricing-transparency-cms-required-file-of-standard-charges"
)

HCA_PATTERNS: dict[str, str] = {
    "st_davids_medical_center_austin": r"ST\.-DAVID'?S-MEDICAL-CENTER_standardcharges",
    "st_davids_north_austin": r"NORTH-AUSTIN-MEDICAL-CENTER_standardcharges",
    "st_davids_south_austin": r"SOUTH-AUSTIN-MEDICAL-CENTER_standardcharges",
    "st_davids_round_rock": r"ROUND-ROCK-MEDICAL-CENTER_standardcharges",
    "heart_hospital_austin": r"HEART-HOSP-OF-AUSTIN_standardcharges(?!.*ROUND-ROCK)",
    "heart_hospital_round_rock": r"HEART-HOSP-OF-AUSTIN-AT-ST\.-DAVID'?S-ROUND-ROCK_standardcharges",
    "st_davids_georgetown": r"GEORGETOWN-HOSPITAL_standardcharges",
    "st_davids_surgical": r"SURGICAL-HOSPITAL_standardcharges",
    "st_davids_rehab": r"ST-DAVIDS-REHAB_standardcharges",
}

ASCENSION_CMS_HPT = "https://healthcare.ascension.org/cms-hpt.txt"
_ascension_mrf_cache: dict[str, str] | None = None

ASCENSION_NAME_MATCH: dict[str, str] = {
    "dell_seton_medical_center": "Dell Seton Medical Center",
    "ascension_seton_medical_center_austin": "Ascension Seton Medical Center Austin",
    "ascension_seton_northwest": "Ascension Seton Northwest",
    "ascension_seton_southwest": "Ascension Seton Southwest",
}

_collector_result_cache: dict[str, dict] = {}
_collector_cache_lock = threading.Lock()


def _load_ascension_mrf_index() -> dict[str, str]:
    global _ascension_mrf_cache
    if _ascension_mrf_cache is not None:
        return _ascension_mrf_cache
    if not unlocker_available():
        raise RuntimeError("Web Unlocker required to fetch Ascension cms-hpt.txt")
    text = fetch_text(ASCENSION_CMS_HPT)
    blocks: list[dict[str, str]] = []
    cur: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            if cur:
                blocks.append(cur)
                cur = {}
            continue
        if ":" in line:
            k, v = line.split(":", 1)
            cur[k.strip().lower()] = v.strip()
    if cur:
        blocks.append(cur)
    _ascension_mrf_cache = {
        (b.get("location-name") or ""): (b.get("mrf-url") or "")
        for b in blocks
        if b.get("mrf-url")
    }
    return _ascension_mrf_cache


def _discover_from_cms_hpt(cms_hpt_url: str, hospital_name: str) -> str:
    """Parse hospital cms-hpt.txt (fetched via Web Unlocker) for the matching mrf-url."""
    if not unlocker_available():
        raise RuntimeError(f"Web Unlocker required to fetch {cms_hpt_url}")
    text = fetch_text(cms_hpt_url)
    blocks: list[dict[str, str]] = []
    cur: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            if cur:
                blocks.append(cur)
                cur = {}
            continue
        if ":" in line:
            k, v = line.split(":", 1)
            cur[k.strip().lower()] = v.strip()
    if cur:
        blocks.append(cur)

    name_lower = hospital_name.lower()
    tokens = [t for t in re.split(r"[\s,'\-]+", name_lower) if len(t) > 3]

    best: tuple[int, str] = (0, "")
    for block in blocks:
        location = block.get("location-name") or ""
        mrf_url = block.get("mrf-url") or ""
        if not mrf_url:
            continue
        loc_lower = location.lower()
        if name_lower in loc_lower or loc_lower in name_lower:
            return mrf_url
        score = sum(1 for t in tokens if t in loc_lower)
        if score > best[0]:
            best = (score, mrf_url)

    if best[1]:
        return best[1]
    if len(blocks) == 1 and blocks[0].get("mrf-url"):
        return blocks[0]["mrf-url"]
    raise RuntimeError(f"MRF not found in cms-hpt.txt for {hospital_name}")


def _discover_ascension_unlocker(hospital_name: str) -> str:
    index = _load_ascension_mrf_index()
    for location, mrf_url in index.items():
        if hospital_name.split("(")[0].strip() in location or location.startswith(hospital_name[:20]):
            return mrf_url
    for _hid, needle in ASCENSION_NAME_MATCH.items():
        if needle.lower() in hospital_name.lower():
            for location, mrf_url in index.items():
                if needle.lower() in location.lower():
                    return mrf_url
    raise RuntimeError(f"Ascension MRF not found in cms-hpt.txt for {hospital_name}")


def _fetch_page_text(url: str) -> str:
    if not unlocker_available():
        raise RuntimeError("Web Unlocker required to fetch portal pages")
    return html.unescape(fetch_text(url))


def _discover_hca_unlocker(hospital_id: str, page_url: str = HCA_PORTAL) -> str:
    pattern = HCA_PATTERNS.get(hospital_id)
    if not pattern:
        raise ValueError(f"No HCA pattern for {hospital_id}")
    text = _fetch_page_text(page_url)
    regex = rf'(https://stctrprodsnsvc00455826e6\.blob\.core\.windows\.net/pt-final-posting-files/[^"\s<>]*{pattern}[^"\s<>]*)'
    match = re.search(regex, text, re.IGNORECASE)
    if not match:
        raise RuntimeError(f"HCA MRF URL not found on page for {hospital_id}")
    return match.group(1).replace("'", "%27")


def _file_url_from_entry(entry: dict) -> str:
    for field in ("file_url", "download_url", "url", "mrf_url"):
        if entry.get(field):
            return str(entry[field])
    return ""


def _match_facility_name(hospital_name: str, locations: str) -> bool:
    name_lower = hospital_name.lower()
    loc_lower = (locations or "").lower()
    if name_lower in loc_lower:
        return True
    tokens = [t for t in re.split(r"[\s,'\-]+", name_lower) if len(t) > 3]
    hits = sum(1 for t in tokens if t in loc_lower)
    return hits >= max(2, len(tokens) // 2)


def _find_mrf_in_collector_output(result: dict, hospital_name: str) -> str:
    files = (
        result.get("standard_charges_files")
        or result.get("pricing_files")
        or result.get("standard_charge_files")
        or []
    )
    if isinstance(files, list) and files:
        best: tuple[int, str] = (0, "")
        for f in files:
            locations = f.get("locations") or f.get("facility_name") or ""
            url = _file_url_from_entry(f)
            if not url:
                continue
            if _match_facility_name(hospital_name, locations):
                return url
            score = sum(1 for w in hospital_name.lower().split() if w in locations.lower())
            if score > best[0]:
                best = (score, url)
        if best[1]:
            return best[1]
        first = files[0]
        url = _file_url_from_entry(first)
        if url:
            return url

    for field in ["mrf_url", "file_url", "download_url", "url", "link"]:
        if result.get(field):
            return str(result[field])

    raise RuntimeError("Collector output did not contain a usable MRF URL")


def _run_collector_cached(collector_id: str, price_page: str, *, sync: bool | None = None) -> dict:
    with _collector_cache_lock:
        if collector_id in _collector_result_cache:
            return _collector_result_cache[collector_id]
    result = run_collector(collector_id, price_page, sync=sync)
    with _collector_cache_lock:
        _collector_result_cache[collector_id] = result
    return result


def clear_collector_cache() -> None:
    with _collector_cache_lock:
        _collector_result_cache.clear()


def clear_collector_cache_entry(collector_id: str) -> None:
    with _collector_cache_lock:
        _collector_result_cache.pop(collector_id, None)


def _fallback_mrf(hospital: dict) -> tuple[str, str]:
    """Bright Data Web Unlocker fallback when Scraper Studio collector fails."""
    hospital_id = hospital["id"]
    system = hospital.get("system", "")

    if system == "hca" and hospital_id in HCA_PATTERNS:
        return _discover_hca_unlocker(hospital_id), "brightdata_unlocker"

    if system == "ascension":
        return _discover_ascension_unlocker(hospital["name"]), "brightdata_unlocker"

    cms_hpt_url = hospital.get("cms_hpt_url") or ""
    if system == "independent" and cms_hpt_url:
        try:
            return _discover_from_cms_hpt(cms_hpt_url, hospital["name"]), "brightdata_unlocker"
        except Exception as exc:
            logger.warning("[%s] cms-hpt discovery failed: %s", hospital_id, exc)

    seed_url = hospital.get("mrf_seed_url") or ""
    if seed_url:
        logger.warning("[%s] Collector failed — using verified seed URL (not scraped)", hospital_id)
        return seed_url, "seed"

    raise RuntimeError(
        f"Cannot discover MRF for {hospital_id} — Scraper Studio collector failed "
        f"and no Web Unlocker fallback available"
    )


def _try_cache_skip_discovery(hospital: dict) -> tuple[str, str, str] | None:
    """Skip live BD collector when verified seed URL already has a valid disk cache."""
    seed_url = hospital.get("mrf_seed_url") or ""
    if not seed_url:
        return None
    if has_valid_disk_cache(seed_url, hospital["id"]):
        collector_id = hospital.get("collector_id") or ""
        logger.info(
            "[%s] Cache skip — valid disk cache for seed URL, skipping collector",
            hospital["id"],
        )
        return seed_url, "cache_skip_collector", collector_id
    return None


def discover_mrf(
    hospital: dict,
    *,
    healed: bool = False,
    sync: bool | None = None,
) -> tuple[str, str, str]:
    """
    Returns (mrf_url, source, collector_id_used).
    source: collector | healed | brightdata_unlocker | seed | cache_skip_collector
    """
    hospital_id = hospital["id"]
    hospital_name = hospital["name"]
    collector_id = hospital.get("collector_id") or ""
    price_page = hospital.get("price_transparency_page") or hospital["homepage"]
    source_label = "healed" if healed else "collector"

    if not healed:
        cached = _try_cache_skip_discovery(hospital)
        if cached:
            return cached

    if collector_id:
        try:
            result = _run_collector_cached(collector_id, price_page, sync=sync)
            mrf_url = _find_mrf_in_collector_output(result, hospital_name)
            if mrf_url:
                return mrf_url, source_label, collector_id
            logger.warning("[%s] Collector %s returned no mrf_url", hospital_id, collector_id)
        except Exception as exc:
            logger.warning("[%s] Collector %s failed: %s", hospital_id, collector_id, exc)

    url, fb_source = _fallback_mrf(hospital)
    return url, fb_source, collector_id
