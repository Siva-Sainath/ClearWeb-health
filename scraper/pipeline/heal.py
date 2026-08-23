"""
pipeline/heal.py
================
Heals collectors using Bright Data's AI capabilities, manually checks previews,
and orchestrates automated approval/rejection.
"""

import json
import logging
import os
import select
import subprocess
import sys
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from pipeline.validate import EXPECTED_PROCEDURES, validate_output
from studio.prompts import enrich_heal_prompt, infer_system
from db.store import insert_heal_event, insert_heal_job

load_dotenv(Path(__file__).parent.parent / '.env')

logger = logging.getLogger(__name__)

HEAL_LOG_PATH = Path(__file__).parent.parent / 'data' / 'heal_log.jsonl'
BD_API_BASE = "https://api.brightdata.com"


def _file_url_from_entry(entry: dict) -> str:
    for field in ("file_url", "download_url", "url", "mrf_url", "mrf-url"):
        val = entry.get(field)
        if isinstance(val, str) and val.startswith("http"):
            return val
    return ""


def _row_has_mrf_url(row: dict) -> bool:
    if not isinstance(row, dict):
        return False

    url_keys = (
        'shoppable_services_csv_url',
        'standard_charges_csv_url',
        'mrf_url',
        'mrf-url',
        'file_url',
        'download_url',
        'pricing_file_url',
        'transparency_file_url',
    )

    # HCA / multi-file formats
    if 'pricing_files' in row:
        files = row['pricing_files']
        if files and isinstance(files, list):
            return any(_file_url_from_entry(f) for f in files if isinstance(f, dict))

    for array_key in ('standard_charges_files', 'standard_charge_files', 'pricing_files'):
        files = row.get(array_key)
        if isinstance(files, list) and files:
            if any(_file_url_from_entry(f) for f in files if isinstance(f, dict)):
                return True

    for key in url_keys:
        val = row.get(key)
        if isinstance(val, str) and val.startswith('http'):
            return True

    for val in row.values():
        if isinstance(val, str) and val.startswith('http') and any(
            val.lower().endswith(ext) for ext in ('.json', '.csv', '.zip', '.gz', '.txt', '.ashx')
        ):
            return True

    return False


def validate_preview(preview_result: list[dict] | None) -> tuple[bool, str]:
    if not preview_result:
        return False, 'preview returned empty list or null'

    for row in preview_result:
        if _row_has_mrf_url(row):
            return True, ''

    return False, 'preview missing expected specific CSV/file URL fields'


def wait_for_refactor_progress(
    collector_id: str,
    timeout_s: int = 600,
    *,
    auto_approve: bool = True,
    hospital_id: str | None = None,
) -> dict:
    """Poll BD refactor_template/progress until done or awaiting approval."""
    api_key = os.environ.get('BRIGHTDATA_API_KEY', '')
    if not api_key:
        raise EnvironmentError('BRIGHTDATA_API_KEY is not set.')

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    progress_url = f"{BD_API_BASE}/dca/collectors/{collector_id}/refactor_template/progress"
    deadline = time.time() + timeout_s
    last_status = "unknown"

    while time.time() < deadline:
        resp = requests.get(progress_url, headers=headers, timeout=30)
        if resp.status_code == 404:
            time.sleep(5)
            continue
        if not resp.ok:
            raise RuntimeError(f"refactor progress HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        status = (data.get("status") or "").lower()
        last_status = status
        logger.info("[heal] refactor progress %s: %s", collector_id, status)

        if status in ("done", "applied"):
            return data

        if status in ("pending_answer", "awaiting_approval"):
            if auto_approve:
                preview = data.get("output") or data.get("preview_result") or []
                process_heal_approval(collector_id, preview, hospital_id)
            return data

        if status in ("failed", "error", "cancelled"):
            raise RuntimeError(f"refactor failed with status={status}")

        time.sleep(5)

    raise RuntimeError(f"refactor progress timeout after {timeout_s}s (last={last_status})")


def process_heal_approval(collector_id: str, preview_result: list[dict] | None, hospital_id: str | None = None) -> bool:
    ok, reason = validate_preview(preview_result)
    
    npx = 'npx.cmd' if sys.platform == 'win32' else 'npx'
    env = os.environ.copy()
    
    if ok:
        logger.info(f'[heal_approval] Preview passed for {collector_id}. Approving.')
        cmd = [npx, '-p', '@brightdata/cli', 'bdata', 'scraper', 'approve', collector_id, '--auto-save', '--json']
        result = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if result.returncode != 0:
            logger.warning(
                f'[heal_approval] approve CLI failed (exit {result.returncode}) for {collector_id}: '
                f'{result.stderr[-200:]}'
            )
            insert_heal_job(None, collector_id, hospital_id, 'needs_human', f'approval CLI exit {result.returncode}')
            return False

        insert_heal_job(None, collector_id, hospital_id, 'approved', 'preview validation passed')
        return True
    else:
        logger.warning(f'[heal_approval] Preview failed for {collector_id}: {reason}. Rejecting.')
        cmd = [npx, '-p', '@brightdata/cli', 'bdata', 'scraper', 'approve', collector_id, '--reject', '--json']
        result = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if result.returncode != 0:
            logger.warning(f'[heal_approval] reject CLI failed (exit {result.returncode}) for {collector_id}')
        
        insert_heal_job(None, collector_id, hospital_id, 'needs_human', reason)
        return False


def heal_collector(
    collector_id: str,
    reason: str,
    *,
    hospital: dict | None = None,
    tier: int = 0,
    auto_approve: bool = True,
    **_kwargs,
) -> dict:
    env = os.environ.copy()
    api_key = env.get('BRIGHTDATA_API_KEY', '')
    if not api_key or api_key == 'your_brightdata_api_key_here':
        raise EnvironmentError('BRIGHTDATA_API_KEY is not set.')

    if hospital:
        if not hospital.get("system"):
            hospital = {
                **hospital,
                "system": infer_system(
                    hospital.get("domain", ""),
                    hospital.get("slug", hospital.get("id", "")),
                    hospital.get("price_transparency_page", hospital.get("url", "")),
                ),
            }
        reason = enrich_heal_prompt(hospital, reason, tier=tier)

    npx = 'npx.cmd' if sys.platform == 'win32' else 'npx'
    cmd = [npx, '-p', '@brightdata/cli', 'bdata', 'scraper', 'heal', collector_id, reason, '--json']

    logger.info(f'[heal] Kicking off CLI: {" ".join(cmd[:4])} ... [reason truncated]')
    
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    
    start_time = time.time()
    last_step = None
    data = None
    max_wait = int(os.environ.get('HEAL_MAX_WAIT_SEC', '900'))
    
    while p.poll() is None:
        if time.time() - start_time > max_wait:
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
            raise RuntimeError(f'heal job exceeded {max_wait}s local wait, job_id={collector_id}.')

        if p.stdout and hasattr(select, 'select'):
            ready, _, _ = select.select([p.stdout], [], [], 2.0)
            if not ready:
                continue
        line = p.stdout.readline() if p.stdout else ""
        if not line:
            time.sleep(0.5)
            continue
            
        line_str = line.strip()
        if not line_str:
            continue
            
        if line_str.startswith('{') and 'collector_id' in line_str:
            try:
                data = json.loads(line_str)
            except json.JSONDecodeError:
                pass
            break
            
        if 'Step: ' in line_str:
            step_info = line_str.split('Step: ')[1].split(' - ')[0].strip()
            if step_info != last_step:
                logger.info(f'[heal] Status transition: {last_step or "queued"} -> {step_info}')
                last_step = step_info

    if p.stdout and p.poll() is not None:
        for line in p.stdout.readlines():
            line_str = line.strip()
            if line_str.startswith('{') and 'collector_id' in line_str and not data:
                try:
                    data = json.loads(line_str)
                except json.JSONDecodeError:
                    pass
            
    p.wait()

    if p.returncode != 0 and not data:
        try:
            from collectors.brightdata import refactor_template_rest
            logger.info(f'[heal] CLI heal exit {p.returncode} — trying REST refactor_template for {collector_id}')
            refactor_template_rest(collector_id, reason[:500])
            hospital_id = hospital.get("id") if hospital else None
            wait_for_refactor_progress(
                collector_id,
                timeout_s=max_wait,
                auto_approve=auto_approve,
                hospital_id=hospital_id,
            )
            return {'collector_id': collector_id, 'status': 'heal_rest_triggered', 'approved': True}
        except Exception as rest_exc:
            logger.warning(f'[heal] REST refactor failed: {rest_exc}')
        raise RuntimeError(f'brightdata scraper heal failed (exit {p.returncode})')
    
    if data:
        data['collector_id'] = collector_id
        status = data.get('status')
        logger.info(f'[heal] CLI returned status: {status}')

        if status == 'heal_trigger_failed':
            try:
                from collectors.brightdata import refactor_template_rest
                logger.info(f'[heal] heal_trigger_failed — REST refactor for {collector_id}')
                refactor_template_rest(collector_id, reason[:500])
                hospital_id = hospital.get("id") if hospital else None
                wait_for_refactor_progress(
                    collector_id,
                    timeout_s=max_wait,
                    auto_approve=auto_approve,
                    hospital_id=hospital_id,
                )
                data['status'] = 'heal_rest_triggered'
                data['approved'] = True
            except Exception as rest_exc:
                logger.warning(f'[heal] REST refactor after heal_trigger_failed: {rest_exc}')
            return data
        
        if status == 'awaiting_approval':
            if auto_approve:
                preview = data.get('preview_result', [])
                hospital_id = hospital['id'] if hospital else None
                approved = process_heal_approval(collector_id, preview, hospital_id)
                data['approved'] = approved
            else:
                hospital_id = hospital['id'] if hospital else None
                insert_heal_job(None, collector_id, hospital_id, 'needs_human', 'awaiting manual approval')
                data['approved'] = False
            
        return data
        
    raise RuntimeError(f'brightdata scraper heal failed (exit {p.returncode})')


def reverify(
    collector_id: str,
    rows: list[dict],
    validation_spec: dict[str, dict] | None = None,
) -> bool:
    """Return True if normalized rows pass validation after a heal attempt."""
    spec = validation_spec if validation_spec is not None else EXPECTED_PROCEDURES
    ok, reason = validate_output(rows, spec)
    if ok:
        logger.info(f'[reverify] {collector_id}: PASSED')
    else:
        logger.warning(f'[reverify] {collector_id}: FAILED — {reason[:200]}')
    return ok


def log_heal_event(
    collector_id: str,
    before_sample: list[dict],
    after_sample: list[dict],
    reason: str,
    success: bool,
) -> None:
    """Append heal event to heal_log.jsonl and heal_events table."""
    timestamp = datetime.now(timezone.utc).isoformat()
    record = {
        'timestamp': timestamp,
        'collector_id': collector_id,
        'reason': reason,
        'success': success,
        'before_count': len(before_sample),
        'after_count': len(after_sample),
        'before_sample': before_sample[:5],
        'after_sample': after_sample[:5],
    }
    HEAL_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(HEAL_LOG_PATH, 'a', encoding='utf-8') as fh:
        fh.write(json.dumps(record) + '\n')
    insert_heal_event(
        timestamp=timestamp,
        collector_id=collector_id,
        reason=reason,
        success=success,
        before_sample=before_sample,
        after_sample=after_sample,
    )
    logger.info(
        f'[heal_log] {collector_id} success={success} '
        f'before={len(before_sample)} after={len(after_sample)}'
    )
