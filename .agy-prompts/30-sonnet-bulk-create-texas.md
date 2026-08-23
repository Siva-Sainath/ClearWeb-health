# Task: Fix bulk_create + create 5 Texas BD collectors (REAL)

**Repo:** `/Users/siva/Documents/scrapeverse_project/scraper`
**Model context:** Use `collectors/brightdata.py` `create_collector()` — NOT raw subprocess with broken regex.

## Problem
`pipeline/bulk_create.py` uses Popen + reads only 15 lines; may miss collector_id or exit before AI generation completes. Collectors never land in DB or dashboard reliably.

## Steps
1. Rewrite `create_collector()` in `pipeline/bulk_create.py` to:
   - `from dotenv import load_dotenv; load_dotenv(ROOT/.env)`
   - Call `from collectors.brightdata import create_collector as bd_create`
   - Use `bd_create(url, prompt, name=slug, timeout=600)` — blocks until done
   - On success: `insert_collector_job(...)` with returned `collector_id`
   - Skip if `collector_job_exists(slug)`
2. Run (with env from scraper/.env):
   ```bash
   cd scraper && set -a && source .env && set +a
   .venv/bin/python -m pipeline.bulk_create --execute --batch 5 --candidates data/texas_candidates.json
   ```
   Skip slug `houston_methodist_main` if already in DB (collector c_mt5fv6sn2r3dqy5225 may exist from manual run — insert if missing).
3. After creates finish, run:
   ```bash
   .venv/bin/python sweep_collector_jobs.py
   ```
4. Print table: slug | collector_id | status | in targets.yaml?

## Rules
- MUST call real `bdata scraper create` via brightdata.py
- Do NOT dry-run
- Log every collector_id created
- If a create fails, continue to next hospital

## Acceptance
Reply with list of collector IDs created + sweep results. PASS only if at least 1 new c_* ID logged.
