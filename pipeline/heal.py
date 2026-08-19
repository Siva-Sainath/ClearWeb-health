"""
pipeline/heal.py
================
Step 8 functions — callable but NOT wired into run_pipeline.py yet.

These are here as importable, tested functions. Wire them in once hospital #1
has been confirmed end-to-end through the main pipeline.

Functions:
  heal_collector()   — wraps `brightdata scraper heal <id> "<reason>"`
  reverify()         — re-runs validate_output() after a heal
  log_heal_event()   — writes a timestamped heal record to data/heal_log.jsonl

DO NOT call these from run_pipeline.py until hospital #1 is confirmed working.
Trigger them manually once you have a genuine break to capture on video.
"""

import json
import logging
import os
import subprocess
import sys
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from pipeline.validate import EXPECTED_PROCEDURES, validate_output

load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

HEAL_LOG_PATH = Path(__file__).parent.parent / "data" / "heal_log.jsonl"


def heal_collector(
    collector_id: str,
    reason: str,
    auto_approve: bool = True,
) -> dict:
    """
    Tell Bright Data's AI to rewrite the collector's extraction logic.
    Wraps: brightdata scraper heal <collector_id> "<reason>" [--auto-approve]

    Parameters
    ----------
    collector_id : str
        The Scraper Studio collector ID (e.g. c_mszwq5pr16a5s86zl8).
    reason : str
        Must describe EXACTLY what's wrong AND what correct output looks like.
        Vague prompts produce vague heals — use the string returned by validate_output().
    auto_approve : bool
        If True, pass --auto-approve so the fix is applied without a human diff review.
        Default True for automated watchdog; set False to inspect the diff manually.

    Returns
    -------
    dict with at minimum {"status": "healed" | "proposed", "collector_id": ...}
    """
    env = os.environ.copy()
    api_key = env.get("BRIGHTDATA_API_KEY", "")
    if not api_key or api_key == "your_brightdata_api_key_here":
        raise EnvironmentError("BRIGHTDATA_API_KEY is not set — cannot call heal_collector().")

    exe = "brightdata.cmd" if sys.platform == "win32" else "brightdata"
    cmd = [exe, "scraper", "heal", collector_id, reason, "--json"]
    if auto_approve:
        cmd.extend(["--auto-approve", "--auto-save"])

    logger.info(f"[heal] Kicking off CLI: {' '.join(cmd[:4])} ... [reason truncated]")
    
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    
    start_time = time.time()
    last_step = None
    data = None
    resolved_via_api = False
    
    while True:
        line = p.stdout.readline()
        if not line:
            break
            
        line_str = line.strip()
        if not line_str:
            continue
            
        if line_str.startswith("{") and "collector_id" in line_str:
            try:
                data = json.loads(line_str)
            except json.JSONDecodeError:
                pass
            break
            
        if "Step: " in line_str:
            step_info = line_str.split("Step: ")[1].split(" — ")[0].strip()
            if step_info != last_step:
                logger.info(f"[heal] Status transition: {last_step or 'queued'} -> {step_info}")
                last_step = step_info
                
            if step_info in ("user_approval", "awaiting_approval") and not resolved_via_api:
                logger.info(f"[heal] Job stuck in {step_info} - Calling resume_automation_job API directly...")
                api_url = f"https://api.brightdata.com/dca/collectors/{collector_id}/resume_automation_job"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                payload = {"message": True, "auto_save": True}
                try:
                    resp = requests.post(api_url, headers=headers, json=payload, timeout=30)
                    logger.info(f"[heal] API Response: {resp.status_code} {resp.text}")
                    resolved_via_api = True
                except Exception as e:
                    logger.error(f"[heal] API Call failed: {e}")
                    
        if time.time() - start_time > 600:
            logger.error(f"[heal] Local wait exceeded 10 min. Job may still be running remotely.")
            logger.error(f"Run: python check_and_approve_heal.py {collector_id} later to check on it.")
            raise RuntimeError(f"heal job exceeded 10 min local wait, job_id={collector_id}. Run check_and_approve_heal.py later.")
            
    p.wait()
    
    if data:
        data["collector_id"] = collector_id
        logger.info(f"[heal] Heal complete: {data}")
        return data
        
    raise RuntimeError(f"brightdata scraper heal failed (exit {p.returncode})")


def reverify(
    collector_id: str,
    rows: list[dict],
    expected_procedures: dict | None = None,
) -> bool:
    """
    Re-run validate_output() after a heal to confirm it actually fixed the problem.
    Safety net — never trust a heal without re-checking.

    Parameters
    ----------
    collector_id : str  (used only for logging context)
    rows : list[dict]   new normalised rows after the heal+re-run
    expected_procedures : dict | None  defaults to EXPECTED_PROCEDURES

    Returns True if validation passes, False if still broken.
    """
    if expected_procedures is None:
        expected_procedures = EXPECTED_PROCEDURES

    ok, reason = validate_output(rows, expected_procedures)
    if ok:
        logger.info(f"[heal] reverify PASSED for collector {collector_id}")
    else:
        logger.warning(f"[heal] reverify FAILED for collector {collector_id}: {reason}")
    return ok


def log_heal_event(
    collector_id: str,
    before_sample: list[dict],
    after_sample: list[dict],
    reason: str,
    success: bool,
) -> None:
    """
    Append a timestamped heal record to data/heal_log.jsonl.

    This log is your demo footage — screen-record a live heal event using this output.
    Each line is a self-contained JSON object.

    Parameters
    ----------
    collector_id : str
    before_sample : list[dict]  first 10 rows BEFORE the heal (pre-heal state)
    after_sample  : list[dict]  first 10 rows AFTER the heal (post-heal state)
    reason : str                the validate_output() failure string that triggered the heal
    success : bool              True if reverify() passed after the heal
    """
    HEAL_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "collector_id": collector_id,
        "reason": reason,
        "success": success,
        "before_row_count": len(before_sample),
        "after_row_count": len(after_sample),
        "before_sample": before_sample[:10],
        "after_sample": after_sample[:10],
    }

    with open(HEAL_LOG_PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")

    status_str = "SUCCESS" if success else "FAILED"
    logger.info(
        f"[heal] Heal event logged → {HEAL_LOG_PATH.name} "
        f"[{status_str}] collector={collector_id}"
    )
