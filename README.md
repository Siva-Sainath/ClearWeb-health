# Clearweb Health

Voice-first hospital price discovery for the **Scrapeverse hackathon** (WeMakeDevs, sponsored by Bright Data).

Hospital prices are public, but they live in CMS **Machine Readable Files (MRFs)**: huge JSON or CSV files that are hard for patients to read or compare across hospitals. Clearweb Health lets you talk to **Aria**, scrape real price files from hospital websites, match them to your insurance and procedure, and see ranked results with a replay of what the scraper actually did.

This is **v1**. Still early, still rough in places.

## Version 1 demo

Full walkthrough: voice onboarding, scrape replay, ranked prices, and Aria explaining while the UI reshapes.

**[Watch the demo (MP4)](docs/demo/clearweb-v1-demo.mp4)**

## What it does

1. **Voice onboarding** with Aria. Say your procedure, insurance, city, and ZIP.
2. **Bright Data Scraper Studio** crawls hospital price transparency portals and finds MRF download links.
3. **Web Unlocker** pulls files when bot protection blocks a direct fetch.
4. **Match engine** maps MRF rows to your payer and CPT/procedure code.
5. **Ranked results** for hospitals near you, with plan-specific prices where available.
6. **Scraper replay** shows the crawl start to finish: cache hits, live downloads, failures, self-healing retries, and a spoken summary.
7. **Dynamic UI** reshapes as Aria explains (charts, compare view, map, savings cards).

## Demo flow

The Austin demo uses pre-collected data for 8 hospital sites (ER visit CPT 99284, Aetna, ZIP 78704). On load it can skip onboarding and go straight into the scrape replay, then results.

Full recording script: see [JUDGE.md](JUDGE.md) for the honest judge path and `/showcase/heal` for St. Luke's self-heal proof.


## Project layout

```
frontend/          Next.js app, Aria voice UI, ScrapeCanvas, results views
backend/           Express API, TTS, scrape job orchestration, webcmd bridge
scraper/           Python pipeline: Bright Data collectors, heal, match engine
docs/              Demo scripts, integration notes, project brief
scripts/           Helper scripts for local dev and demos
```

### Frontend highlights

| Path | Purpose |
|------|---------|
| `frontend/src/components/PatientView.tsx` | Onboarding, scraping, and results phases |
| `frontend/src/components/ScrapeCanvas.tsx` | Live scrape graph and replay timeline |
| `frontend/src/components/ExplanationStage.tsx` | Aria walkthrough with UI actions |
| `frontend/src/components/ResultsView.tsx` | Ranked facilities, charts, follow-ups |
| `frontend/src/hooks/useAriaAgent.ts` | Voice agent and UI action parsing |
| `frontend/src/hooks/useScrapeReplay.ts` | Replay stored scrape events |
| `frontend/src/data/austinDemoSnapshot.json` | Demo profile, results, replay events |

### Backend highlights

| Path | Purpose |
|------|---------|
| `backend/server.js` | Express entry point |
| `backend/services/` | Scrape jobs, TTS, LLM helpers |

### Scraper highlights

| Path | Purpose |
|------|---------|
| `scraper/run_job.py` | Main scrape job, event logging |
| `scraper/match_engine.py` | Insurance + CPT matching against MRF data |
| `scraper/collectors/brightdata.py` | Scraper Studio and Web Unlocker |
| `scraper/pipeline/heal.py` | Self-healing when extraction fails |
| `scraper/studio/` | Collector templates for HCA, Ascension, BSW portals |

## Run locally

You need three terminals for a full live scrape. The demo works with frontend + backend only.

### 1. Backend

```bash
cd backend
cp .env.example .env   # if you add one; otherwise create .env from docs
npm install
npm run dev
```

Runs at http://localhost:3001

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at http://localhost:3000

Optional in `frontend/.env.local`:

```
NEXT_PUBLIC_SKIP_ONBOARDING=true
```

### 3. Scraper (live jobs only)

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add BRIGHTDATA_API_KEY for live scraping
```

## Environment variables

Keep secrets in `.env` files. Do not commit them.

**Backend** (`backend/.env`):

- `PORT` (default 3001)
- `BRIGHT_DATA_API_TOKEN` for live scraping
- `TTS_VOICE`, `OLLAMA_BASE`, `WEBCMD_BRIDGE_SECRET` as needed

**Scraper** (`scraper/.env`):

- `BRIGHTDATA_API_KEY` (same Bright Data key as backend)
- `BRIGHTDATA_UNLOCKER_ZONE` if using Web Unlocker

**Frontend** (`frontend/.env.local`):

- `NEXT_PUBLIC_SKIP_ONBOARDING` to jump straight to demo scrape flow

See `backend/.env.example` and `scraper/.env.example` for Bright Data setup.


## Self-healing and replay

When a hospital site changes layout or rate-limits the scraper, the pipeline can:

- Trigger a collector refactor via Scraper Studio
- Escalate tiers and retry with Web Unlocker
- Log `extraction_failed`, `heal_triggered`, and `heal_resumed` events

The frontend replay (`useScrapeReplay`) plays those events back on the ScrapeCanvas map so users see failures and fixes, not a fake progress bar.

## Hackathon context

Built for **Scrapeverse** using **Bright Data Scraper Studio** and **Web Unlocker** to crawl real hospital price transparency pages, download CMS MRF files, and surface plan-specific prices through a voice-first patient UI.

## Status

Midway through the hackathon. Feedback and suggestions welcome.
