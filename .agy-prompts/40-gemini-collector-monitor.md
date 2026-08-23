# Task: Monitor Texas collector batch + log cache-miss zips

**Repo:** `/Users/siva/Documents/scrapeverse_project`

## Context
- Full batch running: `scraper/scripts/next_collectors.py --execute --batch 0`
- Log: `.agy-logs/texas-collectors-all.log`
- New cache API: `GET /api/prices/cache-check?zip=XXXXX&radius=25`

## Steps
1. Tail `.agy-logs/texas-collectors-all.log` — report last 5 collector outcomes (SUCCESS or create failed).
2. `sqlite3 scraper/data/chargemaster.db "SELECT COUNT(*), status FROM collector_jobs GROUP BY status"`
3. Test cache-check for zips: 78701 (expect cached), 77002 Houston (likely not cached).
4. If batch stalled >15min on one slug, note slug and suggest skip list for memorial_hermann_tmc (BD AI gen errors).

## Rules
- Do NOT edit code unless batch is dead and needs restart command printed.
- Reply with: collectors created count | pending | cache 78701 vs 77002 | recommendation.
