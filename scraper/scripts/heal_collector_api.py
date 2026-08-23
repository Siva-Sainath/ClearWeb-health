#!/usr/bin/env python3
"""JSON API for backend-triggered Bright Data collector heal (stdout only)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from collectors.brightdata import run_collector, wait_for_collector_ready  # noqa: E402
from pipeline.heal import (  # noqa: E402
    heal_collector,
    log_heal_event,
    validate_preview,
    wait_for_refactor_progress,
)
from studio.prompts import infer_system  # noqa: E402


def _coerce_list(raw) -> list[dict]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return [raw]
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description="Heal a BD collector and return JSON")
    parser.add_argument("collector_id", help="Bright Data collector id (c_*)")
    parser.add_argument("--reason", required=True, help="Validation failure / heal prompt")
    parser.add_argument("--seed-url", default="", help="Price transparency seed URL")
    parser.add_argument("--slug", default="", help="Hospital slug for studio templates")
    parser.add_argument("--name", default="", help="Hospital display name")
    parser.add_argument("--domain", default="", help="Hospital domain")
    parser.add_argument("--tier", type=int, default=1, help="Heal escalation tier 0-3")
    parser.add_argument("--rerun", action="store_true", help="Re-run collector after heal")
    args = parser.parse_args()

    hospital = {
        "id": args.slug or args.collector_id,
        "slug": args.slug or args.collector_id,
        "name": args.name or args.slug or args.collector_id,
        "domain": args.domain,
        "url": args.seed_url,
        "price_transparency_page": args.seed_url,
        "system": infer_system(args.domain, args.slug, args.seed_url),
    }

    out: dict = {"collector_id": args.collector_id, "status": "started"}

    try:
        ready, ready_reason = wait_for_collector_ready(args.collector_id, timeout_s=120, poll_s=15)
        if not ready and "template" in ready_reason.lower():
            heal_collector(
                args.collector_id,
                f"Collector template not ready: {ready_reason}",
                hospital=hospital,
                tier=max(args.tier, 3),
                auto_approve=True,
            )
            wait_for_refactor_progress(args.collector_id, timeout_s=600, hospital_id=hospital["id"])

        heal_result = heal_collector(
            args.collector_id,
            args.reason,
            hospital=hospital,
            tier=args.tier,
            auto_approve=True,
        )
        out["heal"] = heal_result
        out["status"] = heal_result.get("status", "healed")

        before_sample: list[dict] = []
        after_sample: list[dict] = []
        preview_ok = False

        if args.rerun and args.seed_url:
            raw = run_collector(args.collector_id, seed_url=args.seed_url, sync=False)
            after_sample = _coerce_list(raw)
            preview_ok, verify_reason = validate_preview(after_sample)
            out["preview_ok"] = preview_ok
            out["verify_reason"] = verify_reason
            log_heal_event(args.collector_id, before_sample, after_sample, args.reason[:400], preview_ok)

        out["success"] = bool(heal_result.get("approved")) or preview_ok
        print(json.dumps(out))
    except Exception as exc:
        print(json.dumps({"collector_id": args.collector_id, "status": "error", "error": str(exc)[:500]}))
        sys.exit(1)


if __name__ == "__main__":
    main()
