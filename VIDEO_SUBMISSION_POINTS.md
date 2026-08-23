# Video submission pointers (≤3 minutes)

Use as a **shot list / talking-head outline** — bullets only, not a script. Target **2:30–3:00** total.

---

## 1. About the project (~45 sec)

**Strong suits to hit:**
- Patient-facing problem: hospital prices are opaque; CMS MRF files exist but are hard to scrape and compare
- **Clearweb Health** + voice agent **Aria** — conversational onboarding, not a form
- **Honest demo scope:** Austin metro (787xx), real cached MRF rows — not fake nationwide coverage
- **Bright Data angle:** scraping at scale, bot protection, collectors that break and heal
- Voice + UI move together — agent spotlights hospitals, opens trust panel, compares options

**Aspects judges may ask — pointers:**
- Who is the user? → uninsured / insured patient shopping a procedure near home
- Live vs replay? → Default **proof-reel** (recorded Aug 2026 events, 8×); dollars from **verified SQLite cache**
- Do you fake prices? → No; out-of-cache CPTs get an explicit caveat, not relabeled dollars
- Why Austin only? → 12 hospitals ingested; Texas pipeline is scale-out story (`/showcase/heal`)

---

## 2. Tech stack & architecture (~45 sec)

**Strong suits to hit:**
- **Frontend:** Next.js, React, Framer Motion dashboard orchestration
- **Backend:** Node/Express — `brainService` single session API bundles prices + replay + explanation
- **Voice:** Groq Whisper (STT) + Edge/Groq TTS; browser fallback for instant onboarding
- **LLM:** Groq for Aria chat; **deterministic** results walkthrough when conductor unavailable (no silent demo)
- **Data:** `chargemaster.db` (SQLite), committed JSON snapshots for deploy-honest replay
- **Scraper:** Python + Bright Data Scraper Studio collectors (`c_*` IDs), Web Unlocker, self-heal pipeline
- **Agent UI:** `[action:…]` tags + `usePresentationOrchestrator` — tool-style steps with delays + TTS

**Aspects judges may ask — pointers:**
- One API to rule the flow → `POST /api/scrape/session`
- How does Aria move the UI? → Parsed actions → dashboard reducer; conductor returns `steps[]`
- External control? → `webcmd` bridge / page-state for MCP or Antigravity (optional mention)
- Deploy? → Frontend Vercel-friendly; live scrape needs local Python + BD token

**Optional 10-sec diagram (say aloud):**
- Mic → STT → LLM (profile + tags) → brain session → replay UI + ranked results → TTS captions

---

## 3. Demo (~90 sec)

**Strong suits to hit:**
- **Act 1:** Voice onboarding (78701, lumbar MRI, Aetna) → auto scrape trigger
- **Act 2:** Proof-reel — map, MRF pipeline phases, **one** self-heal beat (Austin)
- **Act 3:** Results — price range, trust panel with collector IDs, top hospital + compare
- **Act 4:** `/showcase/heal` — St. Luke’s Houston recorded heal + Texas pipeline counts

**Aspects judges may ask — pointers:**
- Show **collector ID** in trust panel (`c_mt…`)
- Distinguish **Austin replay heal** vs **Houston St. Luke’s showcase** (separate recording)
- Mention three BD products: Scraper Studio, Web Unlocker, Self-healing
- Chip follow-ups: cheapest chart, compare top two, map, “what didn’t work”

**Demo path file:** see `DEMO_LOOP_SCRIPT.md` for timed lines.

---

## 4. Learning & growth (~30 sec, optional)

**Strong suits to hit:**
- Learned MRF format chaos — hospital sites differ; collectors + heal beats are real ops work
- **Honesty as UX** — coverage panel, CPT mismatch warnings, failed heal preview shown not hidden
- Voice latency tradeoffs — prefetch TTS, scripted vs live lines, browser fallback
- Scale path: 6 verified Texas collectors; ingest beyond Austin; live scrape path for judges locally

**Aspects judges may ask — pointers:**
- What failed? → Groq rate limits, Edge cold-start, ZIP vs CPT confusion (fixed with gates)
- What’s next? → More ZIPs/hospitals ingested, stronger live path, booking integrations
- Team / timebox? → Hackathon scope: prove BD + voice + honest pricing in one journey

---

## Suggested 3-minute structure (one take)

| Block | Duration | Focus |
|-------|----------|--------|
| Hook + problem | 0:20 | “Hospital prices are hidden in giant JSON files…” |
| Architecture flash | 0:40 | Stack + brain session + BD trio |
| Live demo | 1:30 | Follow `DEMO_LOOP_SCRIPT.md` |
| Close + learnings | 0:30 | Honest scope, heal showcase, what you’d ship next |

---

## Files to have open while recording

| File / URL | Why |
|------------|-----|
| `http://localhost:3000` | Main journey |
| `/showcase/heal` | St. Luke’s Act 2 |
| `JUDGE.md` | ZIP/CPT truth table |
| Trust panel on results | Collector IDs |
