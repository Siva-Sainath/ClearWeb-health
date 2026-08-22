# Scraper Creation Automation

This document outlines the automated pipeline for creating, tracking, and validating Bright Data scrapers in bulk for multiple hospitals. 

## Overview
Because creating a scraper using Bright Data's AI takes 5-10 minutes, creating them one by one is a massive bottleneck. The automated pipeline fires off scraper generation across all candidates in parallel, tracks their status in an SQLite database, and periodically sweeps them to validate their outputs once they finish building.

## Architecture & Workflow

### 1. Database (`db/store.py`)
A local SQLite database tracks the lifecycle of every scraper job in the `collector_jobs` table.
- **Fields:** `hospital_name`, `slug`, `domain`, `target_url`, `collector_id`, `status`
- **Statuses:** 
  - `pending`: AI generation is currently underway or the scraper has not yet been validated.
  - `ready`: The scraper has successfully run and validated its output payload.
  - `failed`: The AI generation failed, or the scraper returns invalid/empty payloads.

### 2. Bulk Creation (`pipeline/bulk_create.py`)
This script fires off the `npx bdata scraper create` command for a list of hospital targets.
- **Parallelism:** It uses `subprocess.Popen` to launch the CLI asynchronously for each hospital.
- **ID Capture:** It reads the first few lines of the CLI's `stdout` to parse the newly generated `collector_id` (e.g., `c_xxxx`) and immediately logs it into the database as `pending`.
- **Pipe Draining (Crucial):** Bright Data's CLI streams hundreds of lines during the AI generation process. To prevent the OS pipe buffer from filling up (which would deadlock the CLI process and permanently halt the AI generation on the server), the script spins up a lightweight daemon thread to continuously drain `stdout`.
- **Foreground Hold:** The Python script explicitly waits (`p.wait()`) for all child CLI processes to finish. This is required because if the Python process exits, Windows will terminate the child processes, which aborts the AI generation and leaves orphaned drafts in the dashboard.

### 3. Sweeping & Validation (`sweep_collector_jobs.py`)
This script polls the database for all `pending` jobs and attempts to validate them.
- **Dry Run:** It runs the scraper using `npx bdata scraper run <collector_id> <url>`.
- **Building Status:** If the CLI returns "AI generation has not completed" or "Collector does not have a template", the sweep script recognizes the scraper is still building and skips it.
- **Validation:** If the run succeeds, the output is passed to `validate_preview(payload)` (shared with the Healer script).
- **Resolution:** If valid, the job status is updated to `ready` and the target is appended to `targets.yaml` for production runs. If it fails, the job is marked `failed`.

## Known Caveats & Prompt Tuning
Bright Data's AI generation can be sensitive to negative constraints in the prompt description. 
For example, explicitly instructing the AI *"Do NOT navigate to or download the CSV files"* caused the AI generation to fail entirely during the `output_schema_generator` phase. The AI's planner struggles with restrictive formatting instructions at creation time.

As a result, the recommended approach is to let the AI build its default interpretation of the extraction task, and if it makes structural mistakes (e.g. trying to download a 500MB CSV file leading to a proxy timeout), correct the behavior using the `heal` pipeline rather than attempting to over-constrain the initial `create` prompt.
