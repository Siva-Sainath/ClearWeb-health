#!/usr/bin/env python3
"""
run_job.py — Scrape job for Clearweb Health UI integration.

Live demo flow (Bright Data products only):
  1. Scraper Studio collector (--sync) per hospital
  2. Web Unlocker for all MRF file downloads
  3. Self-Healing on failure → retry
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

from collectors.brightdata import create_collector  # noqa: E402
from collectors.unlocker import require_unlocker  # noqa: E402
from cpt_index import match_condition_to_cpt  # noqa: E402
from db.store import init_db, upsert_to_db  # noqa: E402
from discover import clear_collector_cache, clear_collector_cache_entry, discover_mrf  # noqa: E402
from match_engine import load_targets, match_facility, rank_results  # noqa: E402
from pipeline.heal import heal_collector, log_heal_event  # noqa: E402
from pipeline.ingest import DownloadResult, download_file  # noqa: E402
from pipeline.normalize import extract_mrf_metadata, normalize_file  # noqa: E402
from pipeline.validate import expected_for_cpt_codes, validate_output  # noqa: E402

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("run_job")

SAMPLE_MB = int(os.environ.get("MRF_SAMPLE_MB", "0")) or None
DEFAULT_CPT = "72148"
PARALLEL = os.environ.get("SCRAPE_PARALLEL", "1") not in ("0", "false", "False")
_ascension_download_lock = __import__("threading").Lock()


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def profile_cpt_codes(profile: dict) -> frozenset[str]:
    if profile.get("cptCode"):
        return frozenset([str(profile["cptCode"]).strip()])
    codes = match_condition_to_cpt(profile.get("procedure") or profile.get("condition") or "")
    if not codes:
        codes = [DEFAULT_CPT]
    return frozenset(codes[:3])


def validation_spec(profile: dict) -> dict[str, dict]:
    return expected_for_cpt_codes(list(profile_cpt_codes(profile)))


def make_event(
    hospital: dict,
    event: str,
    detail: str,
    profile: dict,
    *,
    cash_price: float | None = None,
    insurance_rate: float | None = None,
    discovery_source: str | None = None,
) -> dict:
    node_id = hospital.get("node_id", "n1")
    bd_collector = hospital.get("collector_id") or ""
    return {
        "type": "event",
        "id": f"evt-{uuid.uuid4().hex[:12]}",
        "ts": datetime.now(timezone.utc).isoformat(),
        "collector_id": bd_collector or f"scraper-{node_id}",
        "brightdata_collector_id": bd_collector,
        "collector_name": hospital.get("collector_name") or hospital["id"],
        "event": event,
        "facility_name": hospital["name"],
        "domain": hospital.get("domain", ""),
        "cpt_code": profile.get("cptCode") or list(profile_cpt_codes(profile))[0],
        "cash_price": cash_price,
        "insurance_rate": insurance_rate,
        "network": profile.get("insurance") or "",
        "detail": detail,
        "discovery_source": discovery_source,
        "hospital_id": hospital["id"],
        "node_id": node_id,
    }


def _csv_sample(hospital: dict) -> int | None:
    if hospital.get("format_hint") == "csv":
        return None
    if hospital.get("system") == "independent":
        return None
    return SAMPLE_MB


def _download_mrf(mrf_url: str, hospital: dict, *, tag: str = "", force_unlocker: bool = False) -> DownloadResult:
    hid = hospital["id"] + (f"_{tag}" if tag else "")
    system = hospital.get("system", "")
    kwargs = dict(sample_mb=_csv_sample(hospital), system=system, force_unlocker=force_unlocker)
    if system == "ascension":
        with _ascension_download_lock:
            return download_file(mrf_url, hid, **kwargs)
    return download_file(mrf_url, hid, **kwargs)


def _normalize_and_validate(
    raw_path: Path,
    hospital: dict,
    mrf_url: str,
    profile: dict,
) -> tuple[list[dict], bool, str]:
    cpt_filter = profile_cpt_codes(profile)
    try:
        rows = normalize_file(
            raw_path,
            hospital_id=hospital["id"],
            format_hint=hospital.get("format_hint", "json"),
            source_url=mrf_url,
            filter_codes=cpt_filter,
            allow_partial=SAMPLE_MB is not None and hospital.get("format_hint") == "json",
        )
        ok, reason = validate_output(rows, validation_spec(profile))
        return rows, ok, reason
    except Exception as exc:
        return [], False, str(exc)


def _emit_price_event(hospital: dict, profile: dict, facility: dict, prefix: str) -> None:
    emit(
        make_event(
            hospital,
            "price_extracted",
            f"{prefix}{hospital['name']}",
            profile,
            cash_price=facility["cash_price"],
            insurance_rate=facility["insurance_price"],
        )
    )


def _try_extract(
    hospital: dict,
    profile: dict,
    mrf_url: str,
    discovery_source: str,
    *,
    tag: str = "",
    force_unlocker: bool = False,
) -> tuple[list[dict], bool, str, dict]:
    dl = _download_mrf(mrf_url, hospital, tag=tag, force_unlocker=force_unlocker)
    mrf_meta = extract_mrf_metadata(dl.path, hospital.get("format_hint", "json"))
    emit(
        make_event(
            hospital,
            "mrf_downloaded",
            (
                f"Loaded cached MRF for {hospital['name']}"
                if dl.cached
                else f"Live download via Web Unlocker for {hospital['name']}"
            ),
            profile,
            discovery_source=discovery_source,
        )
        | {"cache_hit": dl.cached, "download_source": dl.source}
    )
    rows, ok, reason = _normalize_and_validate(dl.path, hospital, mrf_url, profile)
    if not ok:
        logger.warning("[%s] validation failed (%s): %s", hospital["id"], discovery_source, reason[:120])
    return rows, ok, reason, mrf_meta


def _emit_rate_limited(hospital: dict, profile: dict, detail: str) -> None:
    emit(make_event(hospital, "rate_limited", detail[:200], profile))


def _unlocker_rediscovery_retry(
    hospital: dict,
    profile: dict,
    events: list[dict],
    *,
    tag: str = "healed",
) -> tuple[list[dict], bool, str, dict]:
    evt = make_event(
        hospital,
        "heal_triggered",
        "Retrying MRF discovery via Bright Data Web Unlocker (cms-hpt + seed)",
        profile,
    )
    events.append(evt)
    emit(evt)
    mrf_url, discovery_source, _ = discover_mrf(hospital, healed=True)
    emit(
        make_event(
            hospital,
            "heal_resumed",
            "Unlocker re-discovery succeeded — retrying download",
            profile,
        )
    )
    rows, ok, reason, mrf_meta = _try_extract(
        hospital, profile, mrf_url, discovery_source, tag=tag, force_unlocker=True
    )
    return rows, ok, reason, mrf_meta


def _heal_and_retry(
    hospital: dict,
    profile: dict,
    reason: str,
    events: list[dict],
    *,
    before_rows: list[dict] | None = None,
) -> tuple[dict | None, list[dict], str, dict]:
    """Tiered self-heal: studio heal → unlocker rediscovery → escalated heal → fresh collector."""
    collector_id = hospital.get("collector_id") or ""
    system = hospital.get("system", "")

    if not collector_id and system == "independent":
        try:
            rows, ok, reason, mrf_meta = _unlocker_rediscovery_retry(hospital, profile, events)
            if ok and rows:
                return None, rows, reason, mrf_meta
        except Exception as exc:
            reason = str(exc)
            if "rate_limited" in reason:
                _emit_rate_limited(hospital, profile, reason)
        return None, [], reason, {}

    if not collector_id:
        return None, [], reason, {}

    rows: list[dict] = []
    mrf_meta: dict = {}
    heal_prompt_base = reason[:400]
    tiers = [0, 1, 2, 3]

    for tier in tiers:
        if tier == 2:
            try:
                rows, ok, reason, mrf_meta = _unlocker_rediscovery_retry(
                    hospital, profile, events, tag=f"healed_t{tier}"
                )
                if ok and rows:
                    log_heal_event(collector_id, before_rows or [], rows, heal_prompt_base, True)
                    return None, rows, reason, mrf_meta
            except Exception as exc:
                reason = str(exc)
                if "rate_limited" in reason:
                    _emit_rate_limited(hospital, profile, reason)
                    time.sleep(min(8, 2 ** tier))
                continue

        if tier == 3:
            seed = hospital.get("price_transparency_page") or hospital.get("homepage") or ""
            try:
                evt = make_event(
                    hospital,
                    "heal_triggered",
                    f"Creating fresh Scraper Studio collector for {hospital['name']}",
                    profile,
                )
                events.append(evt)
                emit(evt)
                created = create_collector(
                    seed,
                    f"Navigate price transparency portal for {hospital['name']}. Return direct MRF URL.",
                    name=hospital.get("collector_name") or hospital["id"],
                    hospital=hospital,
                )
                new_id = created.get("collector_id") or ""
                if new_id:
                    hospital = dict(hospital)
                    hospital["collector_id"] = new_id
                    collector_id = new_id
                    clear_collector_cache_entry(collector_id)
                    mrf_url, discovery_source, _ = discover_mrf(hospital, healed=True)
                    rows, ok, reason, mrf_meta = _try_extract(
                        hospital, profile, mrf_url, discovery_source, tag="fresh_collector", force_unlocker=True
                    )
                    if ok and rows:
                        log_heal_event(collector_id, before_rows or [], rows, heal_prompt_base, True)
                        return None, rows, reason, mrf_meta
            except Exception as exc:
                reason = str(exc)
                if "rate_limited" in reason:
                    _emit_rate_limited(hospital, profile, reason)
            continue

        evt = make_event(
            hospital,
            "heal_triggered",
            f"Self-healing collector {collector_id} (tier {tier})",
            profile,
        )
        events.append(evt)
        emit(evt)

        try:
            heal_collector(
                collector_id,
                heal_prompt_base,
                auto_approve=True,
                hospital=hospital,
                tier=tier,
            )
            clear_collector_cache_entry(collector_id)
            emit(make_event(hospital, "heal_resumed", "Collector healed — retrying discovery and download", profile))

            mrf_url, discovery_source, _ = discover_mrf(hospital, healed=True)
            emit(
                make_event(
                    hospital,
                    "page_loaded",
                    f"Healed collector found price file for {hospital['name']}",
                    profile,
                    discovery_source=discovery_source,
                )
            )
            rows, ok, reason, mrf_meta = _try_extract(
                hospital, profile, mrf_url, discovery_source, tag=f"healed_t{tier}", force_unlocker=True
            )
            log_heal_event(collector_id, before_rows or [], rows, heal_prompt_base, ok)
            if ok and rows:
                return None, rows, reason, mrf_meta
        except Exception as exc:
            reason = str(exc)
            rows = []
            mrf_meta = {}
            if "rate_limited" in reason:
                _emit_rate_limited(hospital, profile, reason)
                time.sleep(min(8, 2 ** tier))

    return None, rows if isinstance(rows, list) else [], reason, mrf_meta if isinstance(mrf_meta, dict) else {}


def process_hospital(hospital: dict, profile: dict) -> tuple[dict | None, list[dict]]:
    events: list[dict] = []
    collector_id = hospital.get("collector_id") or ""
    domain = hospital.get("domain", "hospital")

    if collector_id:
        evt = make_event(
            hospital,
            "collector_started",
            f"Running Bright Data Scraper Studio on {domain}…",
            profile,
        )
    elif hospital.get("system") == "independent":
        evt = make_event(
            hospital,
            "collector_started",
            f"Running Bright Data Web Unlocker + cms-hpt discovery on {domain}…",
            profile,
        )
    else:
        evt = make_event(
            hospital,
            "collector_started",
            f"Discovering MRF via Bright Data Web Unlocker on {domain}…",
            profile,
        )
    events.append(evt)
    emit(evt)

    rows: list[dict] = []
    reason = ""
    mrf_meta: dict = {}

    try:
        mrf_url, discovery_source, _ = discover_mrf(hospital)
        src_label = {
            "collector": "Bright Data Scraper Studio",
            "http_discover": "Bright Data Web Unlocker",
            "brightdata_unlocker": "Bright Data Web Unlocker",
            "seed": "verified MRF URL",
            "healed": "Bright Data Self-Healing",
            "cache_skip_collector": "disk cache (skipped collector)",
        }.get(discovery_source, discovery_source)
        emit(
            make_event(
                hospital,
                "page_loaded",
                f"{src_label} found price file for {hospital['name']}",
                profile,
                discovery_source=discovery_source,
            )
        )
        rows, ok, reason, mrf_meta = _try_extract(hospital, profile, mrf_url, discovery_source)
    except Exception as exc:
        ok = False
        reason = str(exc)
        rows = []

    if ok and rows:
        upsert_to_db(rows)
        facility = match_facility(hospital, rows, profile, mrf_meta)
        _emit_price_event(hospital, profile, facility, "Matched prices from ")
        return facility, events

    fail_detail = reason[:240] or "Extraction failed"
    events.append(make_event(hospital, "extraction_failed", fail_detail, profile))
    emit(events[-1])

    _, rows2, reason2, mrf_meta2 = _heal_and_retry(hospital, profile, reason, events, before_rows=rows)
    if rows2:
        ok2, _ = validate_output(rows2, validation_spec(profile))
        if ok2:
            upsert_to_db(rows2)
            facility = match_facility(hospital, rows2, profile, mrf_meta2)
            _emit_price_event(hospital, profile, facility, "Healed — matched prices from ")
            return facility, events
        reason = reason2

    events.append(make_event(hospital, "extraction_failed", f"Still broken after heal: {reason[:200]}", profile))
    emit(events[-1])
    return None, events


def run_job(profile: dict, *, max_hospitals: int = 17) -> dict:
    require_unlocker()
    init_db()
    clear_collector_cache()
    targets = load_targets()[:max_hospitals]
    results: dict[str, dict] = {}
    all_events: list[dict] = []
    failed: list[str] = []

    if PARALLEL and len(targets) > 1:
        with ThreadPoolExecutor(max_workers=min(17, len(targets))) as pool:
            futures = {pool.submit(process_hospital, h, profile): h for h in targets}
            for fut in as_completed(futures):
                hospital = futures[fut]
                try:
                    facility, evts = fut.result()
                except Exception as exc:
                    logger.exception("Hospital %s failed: %s", hospital["id"], exc)
                    facility, evts = None, []
                    failed.append(hospital["id"])
                    continue
                all_events.extend(evts)
                if facility:
                    results[facility["id"]] = facility
                else:
                    failed.append(hospital["id"])
    else:
        for hospital in targets:
            facility, evts = process_hospital(hospital, profile)
            all_events.extend(evts)
            if facility:
                results[facility["id"]] = facility
            else:
                failed.append(hospital["id"])

    ranked = rank_results(results, profile.get("priorities") or [])
    return {"results": ranked, "events": all_events, "failed_hospitals": failed}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", default="")
    parser.add_argument("--profile-json", default="{}")
    parser.add_argument("--max-hospitals", type=int, default=17)
    args = parser.parse_args()

    profile = json.loads(args.profile_json)

    try:
        payload = run_job(profile, max_hospitals=args.max_hospitals)
        emit({
            "type": "complete",
            "jobId": args.job_id,
            "results": payload["results"],
            "events": payload["events"],
            "count": len(payload["results"]),
            "failed_count": len(payload["failed_hospitals"]),
            "failed_hospitals": payload["failed_hospitals"],
        })
        if not payload["results"]:
            sys.exit(1)
    except Exception as exc:
        emit({"type": "error", "message": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()
