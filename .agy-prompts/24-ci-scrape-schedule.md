# Task: GitHub Actions daily scrape + heal pipeline

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `.github/workflows/` only

## Context
`watcher.yml` exists but uses `|| true` (hides failures). Need production-grade scheduled scrape.

## Requirements
1. Create `.github/workflows/scrape-daily.yml`:
   - cron: `0 6 * * *` UTC + workflow_dispatch
   - Steps: checkout, setup-python 3.11, pip install scraper deps
   - Run `python run_job.py --profile-json '{"zipCode":"78701","procedure":"MRI","insurance":"Aetna","radiusMi":50}' --max-hospitals 17` with BD secrets
   - Parse stdout for complete JSON; fail job if exit non-zero (NO `|| true` on main step)
   - Upload artifact: `scraper/data/last_scrape_events.json` if exists, watcher log
2. Improve `watcher.yml`: remove `|| true` from watcher step OR add `continue-on-error` only on sweep
3. Optional: commit artifact back to repo (only if `--commit` safe pattern documented; skip auto-commit if risky)

## Acceptance
PASS/FAIL + workflow file names.
