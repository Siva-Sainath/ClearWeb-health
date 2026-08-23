# Judge quickstart — honest demo path (< 3 min)

**Repo:** [github.com/Siva-Sainath/ClearWeb-health](https://github.com/Siva-Sainath/ClearWeb-health) (public, branch `clearweb_health`)

## What this app actually is

| Claim | Truth |
|-------|--------|
| Live scrape every time | **No** — default is **proof-reel** (real recorded events at 8× speed + cached SQLite prices) |
| Self-healing visible in UI | **Yes** — if replay includes `heal_triggered` / `heal_resumed` (demo snapshot has them) |
| Aria autonomously drives the page | **Partially** — results walkthrough is scripted; chat uses LLM + post-hoc UI tags |
| Whole state of Texas | **No** — **17 Austin-metro hospitals** in `scraper/targets.yaml` |
| Fully autonomous heal (no human) | **Partially** — `auto_approve=True` on preview gate; not a separate agent |

## Recommended judge flow (3 acts)

### Setup (one terminal each)

```bash
# Backend
cd backend && npm run dev

# Frontend — copy judge env
cd frontend && cp .env.example .env.local && npm run dev
```

Set `backend/.env`: `BRIGHT_DATA_API_TOKEN`, `BRIGHTDATA_UNLOCKER_ZONE`, `GROQ_API_KEY`.

### Act 1 — App (60s)

1. Open http://localhost:3000 — with `SKIP_ONBOARDING=true`, lands on scrape → results fast.
2. Or set `SKIP_ONBOARDING=false` for full voice onboarding (5 fields + tap-to-hear + mic).
3. Watch proof-reel: **Scraper Studio**, **Web Unlocker**, **Self-Healing** labels on timeline.
4. Results → **Bright Data platform proof** panel → copy `c_*` collector IDs.

### Act 2 — Terminal heal (90s) **← Grand Prize moment**

```bash
cd scraper
python demo_heal.py
```

Shows: break → `bdata scraper heal` → strict preview gate → approve → same collector recovers.

### Act 3 — Live optional

Set `NEXT_PUBLIC_HACKATHON_DEMO_MODE=true`, restart frontend, click **Run live scrape now** on results.

## What not to promise

- POST `/dca/trigger` — not wired; use `POST /api/scrape/start` or `bdata scraper run`
- Parallel subagents per Texas region — not built
- S3 pipeline — SQLite + local JSON cache only
- Wall of green CI heals — cron runs watcher; heal approval now scans all target collectors

Full script: [HACKATHON_DEMO.md](./HACKATHON_DEMO.md)
