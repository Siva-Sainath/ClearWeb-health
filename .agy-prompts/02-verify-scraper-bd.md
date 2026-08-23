# Task: Verify Bright Data scraper backend

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `scraper/` and `backend/services/scrapeService.js`, `backend/services/priceQueryService.js` only.

## Context
Self-healing scrape pipeline for hackathon. Recent changes:
- `scraper/run_job.py` — `track_emit()`, `heal_failed` event at end of `_heal_and_retry`
- `scraper/pipeline/heal.py` — `auto_approve` honored; subprocess returncode checked in `process_heal_approval`
- `scraper/query_prices.py` — `heal_events_from_replay()` when DB heal_events empty
- `backend/services/scrapeService.js` — `persistIfEvents()` on cancel/error/failure

Python venv: `scraper/.venv/bin/python` (fallback: `python3`)

## Your job
1. Syntax check:
   - `python3 -m py_compile scraper/run_job.py scraper/query_prices.py scraper/pipeline/heal.py`
   - `node --check backend/services/scrapeService.js`
2. Run cached query smoke test:
   - `scraper/.venv/bin/python scraper/query_prices.py --zip 78701 --procedure "MRI" --insurance Aetna`
   - Parse JSON stdout: confirm keys `results`, `replayEvents`, `healEvents`, `lastUpdated` exist
3. If any step fails, fix ONLY the broken file(s) with minimal diff, re-run until pass

## Acceptance
- All syntax checks pass
- `query_prices.py` prints valid JSON with non-empty `replayEvents` (from demo snapshot or cache)
- Reply: `PASS` or `FAIL` + one-line summary
