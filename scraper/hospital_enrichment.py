"""Load real hospital metadata (address, coords) — no mock prices."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).parent
META_FILE = ROOT / "hospital_metadata.yaml"


@lru_cache(maxsize=1)
def load_metadata() -> dict[str, dict]:
    if not META_FILE.exists():
        return {}
    with open(META_FILE, encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    return data.get("hospitals", {})


def enrich_facility(hospital_id: str, facility: dict) -> dict:
    """Merge verified static metadata into a facility result. Prices untouched."""
    meta = load_metadata().get(hospital_id, {})
    out = {**facility}
    for key in (
        "address",
        "lat",
        "lng",
        "phone",
        "phoneNumber",
        "phoneDepartment",
        "bookingUrl",
        "bookingType",
        "facilityType",
        "photoUrl",
        "photoAttribution",
    ):
        if out.get(key) is not None:
            continue
        if meta.get(key) is not None:
            out[key] = meta[key]
    if meta.get("accredited") is not None:
        out["accredited"] = meta["accredited"]
    if meta.get("wait_days") is not None:
        out["wait_days"] = meta["wait_days"]
    if meta.get("rating") is not None:
        out["rating"] = meta["rating"]
    return out
