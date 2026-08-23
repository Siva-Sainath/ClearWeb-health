import os
import sys
import requests
import argparse
from dotenv import load_dotenv

from pipeline.heal import process_heal_approval

load_dotenv()

def check_and_approve(collector_id: str):
    api_key = os.environ.get("BRIGHTDATA_API_KEY")
    if not api_key:
        print("ERROR: BRIGHTDATA_API_KEY is not set.")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    
    # 1. Get current status
    progress_url = f"https://api.brightdata.com/dca/collectors/{collector_id}/refactor_template/progress"
    print(f"Checking heal status for {collector_id}...")
    resp = requests.get(progress_url, headers=headers)
    
    if resp.status_code != 200:
        print(f"ERROR: Failed to fetch status (HTTP {resp.status_code}): {resp.text}")
        sys.exit(1)
        
    data = resp.json()
    status = data.get("status")
    step = data.get("step")
    
    print(f"Current status: {status}")
    if step:
        print(f"Current step: {step}")
        
    # 2. Handle status
    if status in ("done", "applied"):
        print("Job is already resolved (done/applied). Nothing to do.")
        sys.exit(0)
        
    if status in ("pending_answer", "awaiting_approval"):
        print("Job is awaiting approval. Fetching preview result...")
        
        # Bright Data API returns 'output' as the preview result in refactor_template/progress
        preview_result = data.get("output", [])
        
        print(f"Preview result: {preview_result}")
        approved = process_heal_approval(collector_id, preview_result)
        
        if approved:
            print("Successfully validated preview and approved.")
        else:
            print("Validation failed. Rejected and marked as needs_human.")
            
    elif status in ("failed", "error", "cancelled"):
        print("Job has failed or was cancelled.")
        
    else:
        # Actively running
        print("Job is still actively running. Check back later.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "collector_id",
        nargs="?",
        help="Collector ID to check (omit with --scan-targets)",
    )
    parser.add_argument(
        "--scan-targets",
        action="store_true",
        help="Check all unique collector_id values in targets.yaml",
    )
    args = parser.parse_args()

    if args.scan_targets:
        sys.path.insert(0, os.path.dirname(__file__))
        from match_engine import load_targets

        ids = sorted(
            {
                h.get("collector_id")
                for h in load_targets()
                if h.get("collector_id")
            }
        )
        if not ids:
            print("No collector IDs in targets.yaml")
            sys.exit(0)
        failed = 0
        for cid in ids:
            try:
                check_and_approve(cid)
            except SystemExit as exc:
                if exc.code:
                    failed += 1
            except Exception as exc:
                print(f"ERROR checking {cid}: {exc}")
                failed += 1
        sys.exit(1 if failed else 0)

    if not args.collector_id:
        parser.error("collector_id required unless --scan-targets is set")

    check_and_approve(args.collector_id)

