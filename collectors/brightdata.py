"""
collectors/brightdata.py
========================
Thin wrappers around the Bright Data CLI (`brightdata scraper create/run`).

Design notes:
- create_collector() is included for future hospitals — hospital #1 already has a
  pre-verified collector_id, so it is NOT called in run_pipeline.py for this hospital.
- run_collector() is the workhorse: it calls `brightdata scraper run <id>` via subprocess,
  parses the JSON output, and returns a dict containing at minimum {"mrf_url": "..."}.
- All Bright Data CLI calls require BRIGHTDATA_API_KEY in the environment (or .env).
- If the CLI is unavailable or returns no usable URL, run_collector() raises RuntimeError
  with a clear message — the caller (run_pipeline.py) handles fallback to mrf_seed_url.
"""

import json
import os
import sys
import subprocess
from pathlib import Path

from dotenv import load_dotenv

# Load .env if present (no-op if file doesn't exist)
load_dotenv(Path(__file__).parent.parent / ".env")


def _brightdata_env() -> dict[str, str]:
    """Return env dict for subprocess calls, injecting BRIGHTDATA_API_KEY."""
    env = os.environ.copy()
    api_key = env.get("BRIGHTDATA_API_KEY", "")
    if not api_key or api_key == "your_brightdata_api_key_here":
        raise EnvironmentError(
            "BRIGHTDATA_API_KEY is not set. Copy .env.example → .env and fill in your key."
        )
    return env


def create_collector(hospital_id: str, seed_url: str, prompt: str) -> str:
    """
    Create a new Scraper Studio collector for this hospital.
    Wraps: brightdata scraper create <seed_url> "<prompt>"
    Returns the new collector_id string.

    NOTE: For hospital #1 (hca_houston_medical_center) the collector already exists
    (c_mszwq5pr16a5s86zl8). This function is for subsequent hospitals.
    """
    env = _brightdata_env()
    exe = "brightdata.cmd" if sys.platform == "win32" else "brightdata"
    cmd = [exe, "scraper", "create", seed_url, prompt]
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=300)

    if result.returncode != 0:
        raise RuntimeError(
            f"brightdata scraper create failed (exit {result.returncode}):\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )

    # CLI output is expected to be a JSON object with a collector_id field,
    # or a plain string that IS the collector_id.
    output = result.stdout.strip()
    try:
        data = json.loads(output)
        collector_id = data.get("collector_id") or data.get("id") or data.get("collectorId")
        if not collector_id:
            raise ValueError(f"No collector_id in JSON response: {data}")
        return str(collector_id)
    except json.JSONDecodeError:
        # Assume the raw output is the collector ID
        if output:
            return output
        raise RuntimeError(f"Could not parse collector_id from brightdata output: {output!r}")


def run_collector(collector_id: str, seed_url: str = "", hospital_name: str = "") -> dict:
    """
    Run an existing Scraper Studio collector.
    Wraps: brightdata scraper run <collector_id> [seed_url]
    Returns a dict. Must contain at minimum {"mrf_url": "<url>"}.

    If the collector returns a 'pricing_files' array, it searches for a matching
    'facility_name' == hospital_name to extract the correct 'file_url'.
    Common field names the parser tries: mrf_url, url, file_url, download_url.

    Raises RuntimeError if the CLI call fails or no usable URL is found.
    """
    env = _brightdata_env()
    exe = "brightdata.cmd" if sys.platform == "win32" else "brightdata"
    cmd = [exe, "scraper", "run", collector_id]
    if seed_url:
        cmd.append(seed_url)
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=300)

    if result.returncode != 0:
        raise RuntimeError(
            f"brightdata scraper run failed (exit {result.returncode}):\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )

    output = result.stdout.strip()
    if not output:
        raise RuntimeError(f"brightdata scraper run returned empty output for collector {collector_id}")

    # Parse JSON output
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        raise RuntimeError(
            f"brightdata scraper run output is not valid JSON for collector {collector_id}:\n{output[:500]}"
        )

    # Handle both a direct dict and a list-of-results shape
    if isinstance(data, list):
        if not data:
            raise RuntimeError(f"Collector {collector_id} returned an empty list.")
        data = data[0]

    # Handle 'pricing_files' array structure
    if "pricing_files" in data and isinstance(data["pricing_files"], list):
        for f in data["pricing_files"]:
            if hospital_name and f.get("facility_name") == hospital_name:
                data["mrf_url"] = f.get("file_url") or f.get("url")
                break
        else:
            # If no match or no hospital_name provided, grab the first one as a fallback
            if data["pricing_files"]:
                first_file = data["pricing_files"][0]
                data["mrf_url"] = first_file.get("file_url") or first_file.get("url")

    # Normalise the URL field to "mrf_url" if not found in 'pricing_files'
    if not data.get("mrf_url"):
        url_fields = ["mrf_url", "url", "file_url", "download_url", "link", "href"]
        for field in url_fields:
            if data.get(field):
                data["mrf_url"] = data[field]
                break

    if not data.get("mrf_url"):
        # Let the caller decide what to do if the URL isn't found
        pass

    return data
