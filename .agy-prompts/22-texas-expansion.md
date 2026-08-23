# Task: Texas hospital expansion + bulk_create CLI

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `scraper/data/texas_candidates.json`, `scraper/pipeline/bulk_create.py`, `scraper/scripts/bulk_texas_batch.py` (new)

## Context
Current `targets.yaml` has 17 Austin-metro hospitals only. Need wider Texas for hackathon "long tail" story.

## Requirements
1. Create `scraper/data/texas_candidates.json` with 25+ hospitals across:
   - Houston (8+)
   - Dallas-Fort Worth (8+)
   - San Antonio (5+)
   - Austin extras (4+)
   Each entry: `name`, `slug`, `domain`, `url` (price transparency page URL), `city`, `region`
2. Add `scraper/scripts/bulk_texas_batch.py` CLI:
   - `--batch N` (default 5) — create N collectors via `create_collectors_bulk`
   - `--dry-run` lists candidates without BD API calls
3. Wire `bulk_create.py` `if __name__` to load JSON and run bulk (or call from script)
4. Do NOT run actual `bdata scraper create` unless `--execute` flag passed

## Acceptance
PASS/FAIL + candidate count by region.
