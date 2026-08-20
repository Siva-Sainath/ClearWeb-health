"""
match_engine.py — Match scraped hospital price rows to a patient profile.

Inputs: patient profile (condition, procedure, insurance, zip, priorities)
Output: ranked facility results with best-matched cash + insurance prices
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import TYPE_CHECKING

import yaml
from geopy.distance import geodesic

from cpt_index import extract_patient_insurance_names, match_condition_to_cpt
from db.store import get_rows_for_hospital
from geocode import geocode_address
from hospital_enrichment import enrich_facility

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent

# Approximate Austin coordinates by hospital (fallback until real geocoding)
HOSPITAL_COORDS: dict[str, tuple[float, float]] = {
    "st_davids_medical_center_austin": (30.285, -97.735),
    "st_davids_south_austin": (30.198, -97.805),
    "st_davids_north_austin": (30.408, -97.710),
    "st_davids_round_rock": (30.508, -97.678),
    "heart_hospital_austin": (30.275, -97.728),
    "dell_seton_medical_center": (30.277, -97.734),
    "ascension_seton_medical_center_austin": (30.308, -97.745),
    "ascension_seton_northwest": (30.448, -97.768),
    "bsw_medical_center_austin": (30.258, -97.865),
    "bsw_medical_center_round_rock": (30.518, -97.678),
    "westlake_medical_center": (30.295, -97.810),
    "austin_oaks_hospital": (30.245, -97.820),
    "encompass_rehab_austin": (30.380, -97.720),
    "encompass_rehab_round_rock": (30.505, -97.680),
    "shriners_childrens_texas": (30.350, -97.750),
    "christus_santa_rosa_san_marcos": (29.885, -97.940),
    "christus_santa_rosa_new_braunfels": (29.703, -98.125),
}

# Austin city center fallback
AUSTIN_CENTER = (30.2672, -97.7431)

# ZIP → coordinate approximation for Austin area (commonly used)
ZIP_COORDS: dict[str, tuple[float, float]] = {
    "78701": (30.2672, -97.7431),
    "78702": (30.264, -97.714),
    "78703": (30.285, -97.758),
    "78704": (30.244, -97.765),
    "78705": (30.291, -97.738),
    "78712": (30.284, -97.735),
    "78731": (30.354, -97.755),
    "78732": (30.387, -97.797),
    "78733": (30.312, -97.853),
    "78734": (30.388, -97.925),
    "78735": (30.263, -97.830),
    "78741": (30.226, -97.715),
    "78744": (30.196, -97.760),
    "78745": (30.205, -97.791),
    "78746": (30.257, -97.803),
    "78747": (30.171, -97.780),
    "78748": (30.165, -97.800),
    "78749": (30.210, -97.845),
    "78750": (30.420, -97.828),
    "78751": (30.309, -97.720),
    "78752": (30.335, -97.710),
    "78753": (30.373, -97.694),
    "78754": (30.357, -97.670),
    "78756": (30.323, -97.733),
    "78757": (30.350, -97.735),
    "78758": (30.385, -97.705),
    "78759": (30.395, -97.750),
}


def load_targets() -> list[dict]:
    with open(ROOT / "targets.yaml", encoding="utf-8") as fh:
        return yaml.safe_load(fh).get("hospitals", [])


def zip_to_coords(zip_code: str) -> tuple[float, float] | None:
    return ZIP_COORDS.get(zip_code) or AUSTIN_CENTER


def estimate_distance(zip_code: str, hospital_id: str) -> float:
    """Return approximate distance in miles."""
    origin = zip_to_coords(zip_code) or AUSTIN_CENTER
    dest = HOSPITAL_COORDS.get(hospital_id)
    if not dest:
        return 5.0
    return round(geodesic(origin, dest).miles, 1)


def estimate_drive_min(distance_mi: float) -> int:
    return max(5, round(distance_mi * 3.0))


def select_best_payer_price(rows: list[dict], insurance_names: list[str]) -> tuple[float, str]:
    """
    Pick the best insurance price from rows for the patient's insurance.
    Fallback to cheapest cash/self-pay row if no match.
    Returns (price, payer_label).
    """
    if not rows:
        return 0.0, "No price found"

    # 1. Insurer match
    for name in insurance_names:
        for r in rows:
            payer_full = (r.get("payer") or "").lower()
            if name in payer_full:
                return float(r["price"]), r.get("payer", "Insurance")

    # 2. Cash / self-pay
    cash_rows = [r for r in rows if any(k in (r.get("payer") or "").lower() for k in ("cash", "self pay", "uninsured", "discount", "prompt pay"))]
    if cash_rows:
        best = min(cash_rows, key=lambda r: r["price"])
        return float(best["price"]), best.get("payer", "Cash")

    # 3. Cheapest overall
    cheapest = min(rows, key=lambda r: r["price"])
    return float(cheapest["price"]), cheapest.get("payer", "Negotiated")


def match_facility(hospital: dict, rows: list[dict], profile: dict, mrf_meta: dict | None = None) -> dict:
    """Turn raw rows for one hospital into a UI FacilityResult."""
    hid = hospital["id"]
    node_id = hospital.get("node_id", "n1")
    mrf_meta = mrf_meta or {}
    cpt_candidates = match_condition_to_cpt(profile.get("procedure") or profile.get("condition") or "")
    cpt_code = cpt_candidates[0] if cpt_candidates else (profile.get("cptCode") or "72148")

    insurance_names = extract_patient_insurance_names(profile)

    # Filter rows for matched CPTs
    matched_rows = [r for r in rows if r.get("procedure_code") in cpt_candidates]
    if not matched_rows:
        # fall back to any row with same cpt code
        matched_rows = [r for r in rows if r.get("procedure_code") == cpt_code]
    if not matched_rows:
        # final fallback: all rows (use cheapest)
        matched_rows = rows

    cash_rows = [r for r in matched_rows if any(k in (r.get("payer") or "").lower() for k in ("cash", "self pay", "uninsured"))]
    insurance_price, payer = select_best_payer_price(matched_rows, insurance_names)
    cash_price = min((float(r["price"]) for r in cash_rows), default=insurance_price)

    zip_code = profile.get("zipCode", "78701")
    distance = estimate_distance(zip_code, hid)
    drive_min = estimate_drive_min(distance)

    scraped_address = mrf_meta.get("hospital_address")
    address_source = "static_metadata"
    lat = HOSPITAL_COORDS.get(hid, AUSTIN_CENTER)[0]
    lng = HOSPITAL_COORDS.get(hid, AUSTIN_CENTER)[1]

    if scraped_address:
        coords = geocode_address(str(scraped_address))
        if coords:
            lat, lng = coords
            distance = round(geodesic(zip_to_coords(zip_code) or AUSTIN_CENTER, (lat, lng)).miles, 1)
            drive_min = estimate_drive_min(distance)
            address_source = "mrf_scraped"
        else:
            address_source = "mrf_scraped_no_geocode"

    result = {
        "id": node_id,
        "hospital_name": hospital["name"],
        "facilityType": "Hospital",
        "distance_mi": distance,
        "drive_min": drive_min,
        "accredited": True,
        "network": profile.get("insurance") or "",
        "cash_price": round(cash_price, 2),
        "insurance_price": round(insurance_price, 2),
        "payer_match": payer,
        "cpt_code": cpt_code,
        "procedure": profile.get("procedure") or profile.get("condition") or "",
        "lat": lat,
        "lng": lng,
        "address": scraped_address or None,
        "address_source": address_source,
        "price_source": "mrf_scraped",
        "mrf_last_updated": mrf_meta.get("last_updated_on"),
        "source_url": hospital.get("price_transparency_page") or hospital.get("homepage"),
        "scraped_at": matched_rows[0].get("scraped_at") if matched_rows else None,
    }
    return enrich_facility(hid, result)


def rank_results(results: dict[str, dict], priorities: list[str]) -> dict[str, dict]:
    """Order results dict by priority score."""
    entries = list(results.values())
    if not entries:
        return results

    weights = {"price": 0.4, "distance": 0.3, "accredited": 0.1, "rating": 0.2}
    if "cost" in priorities:
        weights["price"] += 0.25
        weights["distance"] -= 0.1
    if "distance" in priorities:
        weights["distance"] += 0.25
        weights["price"] -= 0.1
    if "accreditation" in priorities:
        weights["accredited"] += 0.15
    if "wait" in priorities:
        weights["rating"] += 0.1

    prices = [e["insurance_price"] for e in entries]
    dists = [e["drive_min"] or e["distance_mi"] for e in entries]
    ratings = [e["rating"] for e in entries]

    min_p, max_p = min(prices), max(prices)
    min_d, max_d = min(dists), max(dists)
    min_r, max_r = min(ratings), max(ratings)

    def norm(v: float, lo: float, hi: float) -> float:
        return 0.5 if hi == lo else (v - lo) / (hi - lo)

    def score(e: dict) -> float:
        price_score = 1 - norm(e["insurance_price"], min_p, max_p)
        dist_score = 1 - norm(e["drive_min"] or e["distance_mi"], min_d, max_d)
        rating_score = norm(e["rating"], min_r, max_r)
        acc_score = 1.0 if e["accredited"] else 0.0
        return (
            price_score * weights["price"]
            + dist_score * weights["distance"]
            + rating_score * weights["rating"]
            + acc_score * weights["accredited"]
        )

    sorted_entries = sorted(entries, key=score, reverse=True)
    return {e["id"]: e for e in sorted_entries}
