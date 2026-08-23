# Hackathon Demo Script — Clearweb Health

**Target:** Under 3 minutes · Grand Prize = Best Use of Bright Data + self-healing

## Prerequisites

```bash
# Backend
cd backend && cp .env.example .env
# Set: BRIGHT_DATA_API_TOKEN, BRIGHTDATA_UNLOCKER_ZONE, GROQ_API_KEY

# Scraper
cd ../scraper && cp .env.example .env
# Set: BRIGHTDATA_API_KEY

# Frontend (.env.local)
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_HACKATHON_DEMO_MODE=true   # live scrape on onboarding exit
# Or false for proof-reel (default) — 8× replay of real events + instant results
```

Start stack: backend `npm run dev`, frontend `npm run dev`.

---

## Act 1 — Run collectors (30s)

**Terminal:**
```bash
cd scraper
npx -p @brightdata/cli bdata login
npx -p @brightdata/cli bdata scraper run c_mt170e801we1fjgf8d \
  "https://www.stdavids.com/patient-resources/patient-financial-resources/pricing-transparency-cms-required-file-of-standard-charges" \
  --json
```

**App:** Complete onboarding → scraping canvas lights up. Point out:
- Scraper Studio (`collector_started`)
- Web Unlocker (`mrf_downloaded` live vs cache)
- Collector ID on timeline rows (`c_*`)

---

## Act 2 — Self-healing (90s) — WIN MOMENT

**Option A — Recorded demo script:**
```bash
cd scraper
python demo_heal.py
```

**Option B — Live in app:** Run live scrape (`Run live scrape now` on results). When a site fails, show:
1. `heal_triggered` on canvas + Aria narration
2. Terminal: `bdata scraper heal c_* "pricing page structure changed"`
3. Strict preview gate — empty `[]` is **rejected**; valid MRF URLs are **approved**
4. `bdata scraper approve c_*` (auto via `process_heal_approval`)
5. Same `c_*` re-run succeeds — **no frontend code changed**

Explain [`docs/healer_architecture.md`](../scraper/docs/healer_architecture.md): never blind `--auto-approve`.

---

## Act 3 — Consumer value (60s)

1. Results load with ranked hospitals
2. Open **Bright Data platform proof** panel — collector IDs, heal events
3. Aria (Groq TTS) walks through best option
4. Follow-up: “Compare my top two” / map route

---

## Env modes

| Mode | Env | Behavior |
|------|-----|----------|
| **Proof-reel** (default) | `NEXT_PUBLIC_HACKATHON_DEMO_MODE=false` | 8× replay + cached results |
| **Live hackathon** | `NEXT_PUBLIC_HACKATHON_DEMO_MODE=true` | Full SSE live scrape |
| **Dev skip** | `NEXT_PUBLIC_SKIP_SCRAPE_ANIMATION=true` | Jump to results |

---

## Manual test matrix

| # | Test | Expected |
|---|------|----------|
| 1 | Onboarding → default scrape | Proof-reel plays; heal toast if in events |
| 2 | Skip replay | Results immediately |
| 3 | Re-run scrape | Clean narration restart |
| 4 | Live scrape | SSE + heal toasts + narration |
| 5 | Trust panel | Shows `c_*` IDs |
| 6 | `python demo_heal.py` | heal → reverify → DB log |

---

## Judge checklist

- [ ] `bdata scraper create/run/heal/approve` with real `c_*`
- [ ] Self-healing without downstream code changes
- [ ] Strict preview validation explained
- [ ] All 3 BD products visible during scrape animation
- [ ] Long-tail Austin hospital targets
- [ ] Public CMS data only
