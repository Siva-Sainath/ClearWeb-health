"""
pipeline/heal.py
================
Heals collectors using Bright Data's AI capabilities, manually checks previews,
and orchestrates automated approval/rejection.
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
from studio.prompts import enrich_heal_prompt
from db.store import insert_heal_job

load_dotenv(Path(__file__).parent.parent / '.env')

logger = logging.getLogger(__name__)

HEAL_LOG_PATH = Path(__file__).parent.parent / 'data' / 'heal_log.jsonl'


def validate_preview(preview_result: list[dict] | None) -> tuple[bool, str]:
    if not preview_result:
        return False, 'preview returned empty list or null'
    
    for row in preview_result:
        # HCA format
        if 'pricing_files' in row:
            files = row['pricing_files']
            if files and isinstance(files, list):
                if any(f.get('file_url') or f.get('url') for f in files):
                    return True, ''
            return False, 'preview returned 0 valid file URLs in pricing_files array'
            
        # General/Encompass format: explicitly check CSV fields
        shoppable = row.get('shoppable_services_csv_url')
        standard = row.get('standard_charges_csv_url')
        if shoppable or standard:
            return True, ''
            
    return False, 'preview missing expected specific CSV/file URL fields'


def process_heal_approval(collector_id: str, preview_result: list[dict] | None, hospital_id: str | None = None) -> bool:
    ok, reason = validate_preview(preview_result)
    
    npx = 'npx.cmd' if sys.platform == 'win32' else 'npx'
    env = os.environ.copy()
    
    if ok:
        logger.info(f'[heal_approval] Preview passed for {collector_id}. Approving.')
        cmd = [npx, '-p', '@brightdata/cli', 'bdata', 'scraper', 'approve', collector_id, '--auto-save', '--json']
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        
        insert_heal_job(None, collector_id, hospital_id, 'approved', 'preview validation passed')
        return True
    else:
        logger.warning(f'[heal_approval] Preview failed for {collector_id}: {reason}. Rejecting.')
        cmd = [npx, '-p', '@brightdata/cli', 'bdata', 'scraper', 'approve', collector_id, '--reject', '--json']
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        
        insert_heal_job(None, collector_id, hospital_id, 'needs_human', reason)
        return False


def heal_collector(
    collector_id: str,
    reason: str,
    *,
    hospital: dict | None = None,
    tier: int = 0,
) -> dict:
    env = os.environ.copy()
    api_key = env.get('BRIGHTDATA_API_KEY', '')
    if not api_key or api_key == 'your_brightdata_api_key_here':
        raise EnvironmentError('BRIGHTDATA_API_KEY is not set.')

    if hospital:
        reason = enrich_heal_prompt(hospital, reason, tier=tier)

    npx = 'npx.cmd' if sys.platform == 'win32' else 'npx'
    cmd = [npx, '-p', '@brightdata/cli', 'bdata', 'scraper', 'heal', collector_id, reason, '--json']

    logger.info(f'[heal] Kicking off CLI: {" ".join(cmd[:4])} ... [reason truncated]')
    
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    
    start_time = time.time()
    last_step = None
    data = None
    
    while True:
        line = p.stdout.readline()
        if not line:
            break
            
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
                    
        if time.time() - start_time > 600:
            logger.error(f'[heal] Local wait exceeded 10 min.')
            raise RuntimeError(f'heal job exceeded 10 min local wait, job_id={collector_id}.')
            
    p.wait()

    if p.returncode != 0 and not data:
        raise RuntimeError(f'brightdata scraper heal failed (exit {p.returncode})')
    
    if data:
        data['collector_id'] = collector_id
        status = data.get('status')
        logger.info(f'[heal] CLI returned status: {status}')
        
        if status == 'awaiting_approval':
            preview = data.get('preview_result', [])
            hospital_id = hospital['id'] if hospital else None
            approved = process_heal_approval(collector_id, preview, hospital_id)
            data['approved'] = approved
            
        return data
        
    raise RuntimeError(f'brightdata scraper heal failed (exit {p.returncode})')
