# Task: Watcher GitHub workflow sanity check

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `.github/workflows/watcher.yml` only (+ fix paths if broken).

## Context
Cron workflow runs scraper watcher + sweep + heal approval. Paths must use `npx` not `npx.cmd`.

## Steps
1. Read `.github/workflows/watcher.yml`
2. Verify: python path, working-directory, cron schedule, commands reference `scraper/sweep_collector_jobs.py` and exist
3. Fix ONLY broken paths or Windows-only `npx.cmd` references
4. Do NOT run the workflow — static review only

## Acceptance
Reply `PASS` or `FAIL` + summary.
