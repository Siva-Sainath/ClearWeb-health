# Judge quickstart — Clearweb Health (Scrape-Verse / Bright Data)

This is the **honest** path to evaluate the hackathon submission. The deployed URL matches what you see in the demo video: real recorded scrape events, no fabricated prices.

## What is real vs replay

| Claim | Truth |
|-------|--------|
| Live scrape every visit | **No** — default is **proof-reel** (real Aug 2026 Austin events at 8× speed + cached MRF prices) |
| Self-healing in UI | **Yes** — replay includes real `heal_triggered` / `heal_resumed` events; St. Luke's Houston heal has a dedicated page |
| Aria autonomous UI | **Yes** when `NEXT_PUBLIC_AGENTIC_RESULTS=true` — Groq conductor drives layout + trust panel |
| Whole state of Texas prices | **No** — Austin metro consumer results; Texas collector pipeline is a separate scale-out story |
| St. Luke's heal | **Real** — collector `c_mt5goll71eekdhe91q`, logged in `heal_log.jsonl`; preview gate honestly failed |

## Recommended demo (3 minutes)

1. **Open the deployed URL** (or local `http://localhost:3000`).
2. **Voice onboarding** — any procedure, insurance, Austin ZIP **78701** or **78704**.
3. **Proof-reel scrape** — watch heal moments slow down with the self-heal overlay (St. David's etc. in Austin replay).
4. **Results** — Aria walks through prices; ask her to show trust / self-heal proof → **Bright Data platform proof** panel with `c_*` collector IDs.
5. **Act 2** — click **Watch St. Luke's self-heal** (results page or `/showcase/heal`) for the Texas Houston heal recording + pipeline counts.

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
