# Judge quickstart — Clearweb Health (Austin demo + Bright Data)

**Primary demo:** Austin metro only — ZIP **78701** (or any **787xx** below), real cached MRF prices, proof-reel with self-heal.

**Act 2 (Bright Data platform):** [`/showcase/heal`](/showcase/heal) — recorded St. Luke's self-heal + collector pipeline stats.

## Quick test (local)

Open **http://localhost:3000** — backend must be on **http://localhost:3001**.

Say: *Brain MRI, CPT 70553, Aetna, Austin, ZIP 78701.*


| Claim | Truth |
|-------|--------|
| Live scrape every visit | **No** — default is **proof-reel** (real Aug 2026 Austin events at 8× speed + cached MRF prices) |
| Self-healing in UI | **Yes** — replay includes real `heal_triggered` / `heal_resumed` events; St. Luke's Houston heal has a dedicated page |
| Aria autonomous UI | **Yes** when `NEXT_PUBLIC_AGENTIC_RESULTS=true` — Groq conductor drives layout + trust panel |
| Whole state of Texas prices | **No** — Austin metro consumer results; Texas collector pipeline is a separate scale-out story |
| St. Luke's heal | **Real** — collector `c_mt5goll71eekdhe91q`, logged in `heal_log.jsonl`; preview gate honestly failed |

## ZIP code coverage (honest)

**Consumer prices are Austin-metro only right now.** SQLite has **12 hospitals** with real MRF rows; `ZIP_COORDS` in the scraper only maps **27 Austin-area ZIPs** (787xx). Houston/Dallas/San Antonio ZIPs return `zip_not_in_coverage` — the UI offers a live scrape, but that path needs local Python + Bright Data (not on Vercel/Render).

**Texas statewide** is a separate story: **6 verified BD collectors** (Dallas, San Antonio) are in the pipeline DB and `/showcase/heal`, but their MRF prices are **not ingested** into the consumer cache yet.

### ZIPs that work today (all return 11–12 cached hospitals)

| ZIP | Area (approx.) |
|-----|----------------|
| **78701** | Downtown Austin (best demo default) |
| **78702** | East Austin |
| **78703** | Clarksville / Tarrytown |
| **78704** | South Congress (snapshot default) |
| **78705** | UT campus |
| **78712** | UT / West Campus |
| **78731** | Northwest Hills |
| **78735** | Barton Creek |
| **78741** | Riverside |
| **78745** | South Austin |
| **78746** | Westlake |
| **78751** | Hyde Park |
| **78757** | Crestview |
| **78758** | North Austin |
| **78759** | Great Hills |

Also cached: 78732, 78733, 78734, 78744, 78747, 78748, 78749, 78750, 78752, 78753, 78754, 78756.

**Do not demo with:** 77002 (Houston), 75201 (Dallas), 78201 (San Antonio), 79901 (El Paso) — no price cache; live scrape will fail on deploy.

## Recommended demo (3 minutes)

1. **Open the deployed URL** (or local `http://localhost:3000`).
2. **Voice onboarding** — any procedure, insurance, Austin ZIP **78701** or **78704**.
3. **Proof-reel scrape** — watch heal moments slow down with the self-heal overlay (St. David's etc. in Austin replay).
4. **Results** — Aria walks through prices; ask her to show trust / self-heal proof → **Bright Data platform proof** panel with `c_*` collector IDs.
5. **Act 2** — click **Watch St. Luke's self-heal** (results page or `/showcase/heal`) for the Texas Houston heal recording + pipeline counts (now **6 verified** collectors statewide).

## Honest script (read to camera or judges)

> "I'm looking for hospital prices near Austin. I need a **brain MRI** — CPT **70553** — and I'm on **Aetna**. My ZIP is **78701**."
>
> *(Proof-reel plays — point at Scraper Studio, Web Unlocker, and self-heal slowing down.)*
>
> "These prices come from **real CMS machine-readable files** we scraped with Bright Data — not estimates. The replay is recorded events at 8× speed; the dollar amounts are from our verified cache."
>
> *(On results — let Aria conduct, or ask: "Show me how you scraped this" / "Open the trust panel.")*
>
> "Every hospital ties to a Bright Data collector ID — `c_mt170…` — you can verify in the trust panel."
>
> *(Navigate to `/showcase/heal`.)*
>
> "Separately, we're scaling collectors across Texas — six verified so far. Here's a **recorded self-heal** on St. Luke's Houston when a collector broke; Bright Data refactored the template. We show the honest outcome when the preview gate fails — we don't fake prices."

### Alternate procedure (ER visit — matches committed snapshot replay)

> "Emergency room visit, CPT **99284**, **Aetna**, ZIP **78704**, Austin."

## E2E test checklist (local)

```bash
# Terminal 1 — restart backend so /api/prices/cache-check is live
cd backend && node server.js

# Terminal 2 — frontend (restart after .env.local changes)
cd frontend && npm run dev
```

1. Open `http://localhost:3000`
2. Complete voice onboarding with **78701** + Brain MRI + Aetna
3. Onboarding banner should say **"12 hospitals cached near you"**
4. Proof-reel: heal overlay appears on `heal_triggered`
5. Results: Aria conductor + ranked prices (~12 facilities)
6. Trust panel: collector IDs + link to **Watch St. Luke's self-heal**
7. `/showcase/heal` — St. Luke's replay + Texas pipeline (**6 verified**)

Verify cache API: `curl "http://localhost:3001/api/prices/cache-check?zip=78701"` → `"cached": true`

## URLs

| Path | Purpose |
|------|---------|
| `/` | Full patient journey (onboarding → proof-reel → results) |
| `/showcase/heal` | Recorded St. Luke's BD self-heal + Texas collector snapshot |

## Local setup (optional)

```bash
# Terminal 1 — backend
cd backend && npm install && npm start

# Terminal 2 — frontend
cd frontend && cp .env.example .env.local
# Set NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
npm install && npm run dev
```

### Env flags (frontend)

```ini
NEXT_PUBLIC_AGENTIC_RESULTS=true
NEXT_PUBLIC_SKIP_ONBOARDING=false
NEXT_PUBLIC_DEMO_INSTANT_RESULTS=false
NEXT_PUBLIC_HACKATHON_DEMO_MODE=false
```

### Backend (Render or local `.env`)

```ini
AGENTIC_RESULTS=true
GROQ_API_KEY=...
BRIGHT_DATA_API_TOKEN=...
BRIGHTDATA_UNLOCKER_ZONE=...
```

## Live scrape (local judges only)

On the results page, **Run live scrape now** spawns a real Python job (requires local scraper venv + BD token). **Not available on Vercel/Render free tier.**

Set `NEXT_PUBLIC_HACKATHON_DEMO_MODE=true` to force live scrape when ZIP has no cache.

## Bright Data products shown

1. **Scraper Studio** — hospital portal collectors (`c_*` IDs in trust panel)
2. **Web Unlocker** — live MRF downloads when bot protection blocks direct fetch
3. **Self-healing** — `refactor_template` on broken collectors (St. Luke's showcase)

## Data files (committed, deploy-honest)

| File | Role |
|------|------|
| `frontend/src/data/austinDemoSnapshot.json` | Austin prices + 66-event replay |
| `frontend/src/data/stlukesHealShowcase.json` | St. Luke's heal replay + heal log steps |
| `frontend/src/data/texasCollectorSnapshot.json` | Collector pipeline counts when Python DB unavailable on Render |

## Cold starts

Render free tier may sleep — open the URL ~2 minutes before judging so TTS/LLM respond promptly.
