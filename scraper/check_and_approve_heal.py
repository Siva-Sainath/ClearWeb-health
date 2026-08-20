import os
import sys
import requests
import argparse
from dotenv import load_dotenv

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
        
    if status == "pending_answer":
        print("Job is awaiting approval. Approving immediately...")
        resume_url = f"https://api.brightdata.com/dca/collectors/{collector_id}/resume_automation_job"
        payload = {"message": True, "auto_save": True}
        resume_resp = requests.post(resume_url, headers=headers, json=payload)
        
        if resume_resp.status_code == 200:
            print("Successfully approved and auto-saved.")
        else:
            print(f"Failed to approve (HTTP {resume_resp.status_code}): {resume_resp.text}")
            sys.exit(1)
            
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
