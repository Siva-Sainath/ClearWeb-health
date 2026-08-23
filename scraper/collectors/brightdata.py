"""
collectors/brightdata.py — Bright Data Scraper Studio CLI wrappers + REST fallbacks.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

# Default: sync mode (~5–50s) for live demo after onboarding. Set 0 for async batch polling.
SYNC_MODE = os.environ.get("BRIGHTDATA_SCRAPER_SYNC", "1") not in ("0", "false", "False")
# Bright Data CLI --sync-timeout must be 25–50 seconds
SYNC_TIMEOUT = min(50, max(25, int(os.environ.get("BRIGHTDATA_SYNC_TIMEOUT", "50"))))
BD_API_BASE = "https://api.brightdata.com"


def _api_key() -> str:
    key = os.environ.get("BRIGHTDATA_API_KEY", "")
    if not key or key == "your_brightdata_api_key_here":
        raise EnvironmentError(
            "BRIGHTDATA_API_KEY is not set. Copy .env.example → .env and fill in your key."
        )
    return key


def _brightdata_env() -> dict[str, str]:
    env = os.environ.copy()
    _api_key()  # validate
    return env


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


def _npx_cmd() -> str:
    return "npx.cmd" if sys.platform == "win32" else "npx"


def _is_rate_limited(stderr: str, stdout: str) -> bool:
    combined = (stderr + stdout).lower()
    return any(
        token in combined
        for token in ("rate limit", "rate_limit", "429", "too many requests", "throttl")
    )


def _extract_response_id(text: str) -> str | None:
    """Parse Bright Data async response_id from CLI stderr (sync timeout)."""
    m = re.search(r"response_id:\s*([a-z0-9]+)", text, re.I)
    return m.group(1) if m else None


def get_result_by_response_id(response_id: str, timeout_s: int = 300) -> dict:
    """Poll GET /dca/get_result by response_id after async/sync-timeout run."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = requests.get(
            f"{BD_API_BASE}/dca/get_result",
            headers=_auth_headers(),
            params={"response_id": response_id},
            timeout=60,
        )
        if resp.status_code == 429:
            raise RuntimeError("rate_limited: Bright Data get_result rate limited")
        if resp.status_code in (404, 400):
            time.sleep(3)
            continue
        if not resp.ok:
            raise RuntimeError(f"get_result failed ({resp.status_code}): {resp.text[:400]}")
        data = resp.json()
        status = (data.get("status") or data.get("state") or "").lower()
        if status in ("done", "complete", "success", "finished") or data.get("result"):
            return data
        if status in ("failed", "error"):
            raise RuntimeError(f"Collector REST run failed: {data}")
        time.sleep(3)
    raise RuntimeError(f"get_result timed out after {timeout_s}s for response_id={response_id}")


def collector_info_rest(collector_id: str) -> dict:
    """GET collector metadata — used to detect missing template."""
    resp = requests.get(
        f"{BD_API_BASE}/dca/collectors/{collector_id}",
        headers=_auth_headers(),
        timeout=30,
    )
    if not resp.ok:
        return {"error": resp.text[:200], "status_code": resp.status_code}
    return resp.json()


def collector_ready(collector_id: str) -> tuple[bool, str]:
    """Return (ready, reason). False when BD reports no template / still building."""
    info = collector_info_rest(collector_id)
    if info.get("error"):
        return True, "collector info unavailable — proceed with run"
    err = (info.get("error_message") or info.get("error") or "").lower()
    if "template" in err and "not" in err:
        return False, "Collector does not have a template"
    status = (info.get("status") or info.get("state") or "").lower()
    if status in ("building", "pending", "creating"):
        return False, f"Collector still {status}"
    return True, "ready"


def trigger_immediate_rest(collector_id: str, seed_url: str = "") -> dict:
    """POST /dca/trigger_immediate — start async collector run via REST."""
    payload: dict = {"collector": collector_id}
    if seed_url:
        payload["url"] = seed_url
    resp = requests.post(
        f"{BD_API_BASE}/dca/trigger_immediate",
        headers=_auth_headers(),
        json=payload,
        timeout=60,
    )
    if resp.status_code == 429:
        raise RuntimeError("rate_limited: Bright Data trigger_immediate rate limited")
    if not resp.ok:
        raise RuntimeError(f"trigger_immediate failed ({resp.status_code}): {resp.text[:400]}")
    return resp.json()


def get_result_rest(collector_id: str, timeout_s: int = 300) -> dict:
    """Poll GET /dca/get_result until collector output is ready."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = requests.get(
            f"{BD_API_BASE}/dca/get_result",
            headers=_auth_headers(),
            params={"collector": collector_id},
            timeout=60,
        )
        if resp.status_code == 429:
            raise RuntimeError("rate_limited: Bright Data get_result rate limited")
        if resp.status_code == 404:
            time.sleep(3)
            continue
        if not resp.ok:
            raise RuntimeError(f"get_result failed ({resp.status_code}): {resp.text[:400]}")
        data = resp.json()
        status = (data.get("status") or data.get("state") or "").lower()
        if status in ("done", "complete", "success", "finished") or data.get("result"):
            return data
        if status in ("failed", "error"):
            raise RuntimeError(f"Collector REST run failed: {data}")
        time.sleep(3)
    raise RuntimeError(f"get_result timed out after {timeout_s}s for {collector_id}")


def refactor_template_rest(collector_id: str, prompt: str) -> dict:
    """POST /dca/collectors/{id}/refactor_template — trigger heal via REST."""
    resp = requests.post(
        f"{BD_API_BASE}/dca/collectors/{collector_id}/refactor_template",
        headers=_auth_headers(),
        json={"prompt": prompt},
        timeout=60,
    )
    if resp.status_code == 429:
        raise RuntimeError("rate_limited: Bright Data refactor_template rate limited")
    if not resp.ok:
        raise RuntimeError(f"refactor_template failed ({resp.status_code}): {resp.text[:400]}")
    return resp.json()


def run_collector_rest(collector_id: str, seed_url: str = "", timeout_s: int | None = None) -> dict:
    """Run collector via REST trigger + poll (CLI fallback)."""
    trigger_immediate_rest(collector_id, seed_url)
    raw = get_result_rest(collector_id, timeout_s=timeout_s or int(os.environ.get("BRIGHTDATA_ASYNC_TIMEOUT", "300")))
    result = raw.get("result") or raw.get("data") or raw
    if isinstance(result, str):
        result = json.loads(result)
    if isinstance(result, list):
        if not result:
            raise RuntimeError(f"Collector {collector_id} REST returned empty list")
        result = result[0]
    return result


def create_collector(
    seed_url: str,
    prompt: str,
    *,
    name: str = "",
    timeout: int = 600,
    hospital: dict | None = None,
) -> dict:
    """Create a Scraper Studio collector. Returns dict with collector_id and name."""
    if hospital:
        from studio.prompts import enrich_create_prompt

        prompt = enrich_create_prompt(hospital, prompt)

    env = _brightdata_env()
    cmd = [_npx_cmd(), "-p", "@brightdata/cli", "bdata", "scraper", "create", seed_url, prompt, "--json"]
    if name:
        cmd.extend(["--name", name])
    cmd.extend(["--timeout", str(timeout)])
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=timeout + 120)
    if result.returncode != 0:
        raise RuntimeError(
            f"brightdata scraper create failed (exit {result.returncode}):\n"
            f"stdout: {result.stdout[-1200:]}\nstderr: {result.stderr[-400:]}"
        )
    output = result.stdout.strip()
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        if output and output.startswith("c_"):
            return {"collector_id": output.strip(), "name": name}
        raise RuntimeError(f"Could not parse collector create output: {output!r}")

    collector_id = data.get("collector_id") or data.get("id") or data.get("collectorId")
    if not collector_id:
        raise RuntimeError(f"No collector_id in create response: {data!r}")
    data["collector_id"] = str(collector_id)
    return data


def run_collector(
    collector_id: str,
    seed_url: str = "",
    hospital_name: str = "",
    *,
    sync: bool | None = None,
) -> dict:
    """
    Run a Scraper Studio collector. Returns parsed JSON dict or list item.
    Uses --sync by default for demo (server cap ~50s, typically 5–15s on HCA portal).
    Falls back to REST on CLI failure.
    """
    env = _brightdata_env()
    use_sync = SYNC_MODE if sync is None else sync
    cmd = [_npx_cmd(), "-p", "@brightdata/cli", "bdata", "scraper", "run", collector_id]
    if seed_url:
        cmd.append(seed_url)
    if use_sync:
        cmd.extend(["--sync", "--sync-timeout", str(SYNC_TIMEOUT)])
    else:
        cmd.extend(["--timeout", os.environ.get("BRIGHTDATA_ASYNC_TIMEOUT", "300")])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=SYNC_TIMEOUT + 60 if use_sync else 600,
        )

        if result.returncode != 0:
            if _is_rate_limited(result.stderr, result.stdout):
                raise RuntimeError(f"rate_limited: {result.stderr[-200:]}")
            combined = (result.stdout or "") + (result.stderr or "")
            response_id = _extract_response_id(combined)
            if response_id and use_sync and "timed out" in combined.lower():
                logger.info("Sync timed out for %s — polling response_id %s", collector_id, response_id)
                raw = get_result_by_response_id(
                    response_id,
                    timeout_s=int(os.environ.get("BRIGHTDATA_ASYNC_TIMEOUT", "300")),
                )
                data = raw.get("result") or raw.get("data") or raw
                if isinstance(data, str):
                    data = json.loads(data)
                if isinstance(data, list):
                    if not data:
                        raise RuntimeError(f"Collector {collector_id} async returned empty list")
                    data = data[0]
                return data
            raise RuntimeError(
                f"brightdata scraper run failed (exit {result.returncode}):\n"
                f"stdout: {result.stdout[-800:]}\nstderr: {result.stderr[-400:]}"
            )

        output = result.stdout.strip()
        if not output:
            raise RuntimeError(f"brightdata scraper run returned empty output for collector {collector_id}")

        try:
            data = json.loads(output)
        except json.JSONDecodeError:
            raise RuntimeError(
                f"brightdata scraper run output is not valid JSON for collector {collector_id}:\n{output[:500]}"
            )

        if isinstance(data, list):
            if not data:
                raise RuntimeError(f"Collector {collector_id} returned an empty list.")
            data = data[0]

        return data
    except Exception as cli_exc:
        logger.warning("CLI run_collector failed for %s, trying REST: %s", collector_id, cli_exc)
        if "does not have a template" in str(cli_exc).lower():
            raise
        try:
            async_timeout = int(os.environ.get("BRIGHTDATA_ASYNC_TIMEOUT", "300"))
            return run_collector_rest(collector_id, seed_url, timeout_s=async_timeout)
        except Exception as rest_exc:
            if "rate_limited" in str(cli_exc) or "rate_limited" in str(rest_exc):
                raise RuntimeError(f"rate_limited: {rest_exc}")
            raise RuntimeError(f"CLI and REST collector run failed: {cli_exc}; REST: {rest_exc}")
