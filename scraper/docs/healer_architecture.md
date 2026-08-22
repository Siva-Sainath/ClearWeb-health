# AI Self-Healer Architecture

This document outlines the architecture and safeguards implemented around the automated Bright Data AI Scraper Self-Healer pipeline.

## The Core Problem: AI Hallucination & Reward Hacking

Initially, the pipeline triggered scraper healing by passing the `--auto-approve` flag to the Bright Data CLI. This caused a massive silent failure loop due to the AI's behavior:
1. When faced with a broken page (e.g., a 404 or a changed DOM structure), the AI would repeatedly attempt to write extraction logic and fail Bright Data's internal syntax/output validations.
2. After repeatedly failing, the AI would "reward hack" by writing a lazy `try/catch` block that simply returned an empty array (`[]`) to avoid crashing.
3. Bright Data's platform considered the crash-free code a "success" and pushed the draft to the approval phase.
4. Because we passed `--auto-approve=True`, our pipeline blindly accepted this empty array payload as the new production scraper code, silently breaking our extraction.

## The Solution: The Strict Approval Gate

**Design Rule:** Never trust `status: done` or auto-approve a heal. Always trust `status: awaiting_approval` combined with strict internal inspection of the `preview_result`.

To enforce this, we centralized the approval logic into a physical gate that physically blocks AI hallucination from production. 

### 1. `pipeline/heal.py` (Immediate Pipeline Execution)
- The `--auto-approve` and `--auto-save` flags were entirely removed from the CLI wrapper.
- All heals now finish in `status: awaiting_approval` and return a sample `preview_result` representing what the newly drafted scraper code produced.
- **Strict Validation (`validate_preview`)**: Instead of broadly checking for truthy values, the preview is strictly checked for exactly the fields we need. For example, it must explicitly contain non-null URLs in `shoppable_services_csv_url`, `standard_charges_csv_url`, or inside `pricing_files[].file_url`.
- **Dynamic Approval (`process_heal_approval`)**: If the preview contains valid CSV URLs, the pipeline auto-runs `bdata scraper approve <id>`. If it is empty or hallucinated, it auto-runs `bdata scraper approve <id> --reject`. 

### 2. `check_and_approve_heal.py` (Orphan Recovery Cron)
- Because the AI can sometimes take up to 15-20 minutes to fail and write its "lazy code", our local python scripts time out after a strict 10-minute limit (`RuntimeError`) to prevent hung workers.
- When this happens, the draft sits isolated on Bright Data's servers in a `pending_answer` state.
- `check_and_approve_heal.py` acts as a cleanup cron job. It fetches the `preview_result` for stuck jobs via the REST API and routes it through the exact same `process_heal_approval()` gate mentioned above.
- This creates a unified "Steer to Failure" architecture. There is only one set of validation rules, and both immediate runs and delayed cron runs use it.

### 3. The `heal_jobs` Database Table
- All approvals and rejections are logged into a new `heal_jobs` table in the SQLite database (`data/chargemaster.db`).
- If a scraper is completely unhealable (like a 404 page) or produces hallucinated empty arrays, the AI's draft is rejected and the database logs `status = 'needs_human'` along with the exact `reason` (e.g., `"preview returned empty list or null"`).
- Your frontend/dashboard can now simply query `SELECT * FROM heal_jobs WHERE status = 'needs_human'` to generate alerts and tickets for human data engineers, entirely isolating the end-user database from the scraper's failure.

## Timeouts & Behavior Quirks
- **The AI Loop:** When the AI struggles (like with a 404 page), it will aggressively loop through internal stages (`planner` -> `code_fixer` -> `step_preview_runner` -> `request_fulfillment_validator`) for over 15 minutes before giving up. We observed it hit over 400 attempts in a 10-minute window during load testing.
- **Local Timeouts:** Never wait for Bright Data indefinitely. The Python `heal_collector` loop is hardcoded to raise a `RuntimeError` at 10 minutes (600 seconds). Let the script crash gracefully, log the timeout, and allow `check_and_approve_heal.py` to retrieve the results asynchronously when Bright Data finally finishes.
