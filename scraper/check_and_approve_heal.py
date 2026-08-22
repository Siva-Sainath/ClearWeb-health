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
    parser.add_argument("collector_id", help="The collector ID to check")
    args = parser.parse_args()
    
    check_and_approve(args.collector_id)

