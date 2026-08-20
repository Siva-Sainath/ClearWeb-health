# Clearweb Health — Austin Multi-Hospital Self-Healing Scraper

> **Paste this as the initial Cursor project brief.** Phased tasks at the bottom — feed stages in order if you prefer incremental work.

## Goal

Build an **autonomous, self-healing hospital price scraper** for the **Austin, TX metro area**, wired to **Bright Data Scraper Studio** (CLI + REST API), with a **live Framer Motion UI** showing scrape + heal events in real time.

Demo audience: hackathon judges. Proof = timestamped organic heal events from a continuous watcher **plus** an honest manual fallback trigger.

---

## Where to get `BRIGHT_DATA_API_TOKEN`

1. Sign in at [brightdata.com](https://brightdata.com) (free trial, no card for Scraper Studio starter credits).
2. Go to **Account Settings → Users** (direct: [brightdata.com/cp/setting/users](https://brightdata.com/cp/setting/users)).
3. Copy your **API Key** (Bearer token). This is the same key for CLI, REST API, and MCP.
4. Paste into:
   - `scraper/.env` → `BRIGHTDATA_API_KEY=...`
   - `backend/.env` → `BRIGHT_DATA_API_TOKEN=...` (Node alias — same value)

**Product to use:** **Scraper Studio** (AI-generated collectors), not Web Scraper API datasets or Unlocker alone. Credits: ~1 credit/page load for `scraper create`, `run`, and `heal`.

**CLI (no install):** `npx -p @brightdata/cli bdata <command>`  
**MCP (optional, for dev):** `npx -p @brightdata/cli brightdata add mcp` → adds tools like `scrape_as_markdown`, `search_engine` to Cursor.

---

## Architecture

```
Voice onboarding (Aria)
  → POST /api/scrape/start
  → Node scrapeService spawns Python pipeline / watcher
  → Bright Data CLI: scraper run → validate → heal (if broken) → reverify
  → SSE /api/scrape/:jobId/events → ScrapeCanvas (live graph + timeline)
  → Poll /results → ResultsView (Austin facilities on map)
```

### Repo layout (after setup)

| Path | Role |
|------|------|
| `scraper/` | Python pipeline (Bright Data CLI wrappers, validate, heal, watcher) |
| `scraper/targets.yaml` | Austin hospital targets + collector IDs |
| `scraper/watcher.py` | Continuous cron-style runs → `data/watcher_log.jsonl` |
| `backend/services/scrapeService.js` | Job orchestration, SSE events, spawn Python |
| `frontend/src/components/ScrapeCanvas.tsx` | Live scrape/heal visualization |
| `frontend/src/hooks/useScrapeStream.ts` | SSE → node states + timeline |

---

## Austin target mix (6 hospitals)

Pick for **format diversity**, not convenience:

| # | Hospital | System | Why |
|---|----------|--------|-----|
| 1 | St. David's Medical Center | HCA / St. David's | Large system, JSON MRF, facility picker on shared portal |
| 2 | St. David's South Austin Medical Center | HCA | Same portal, different facility row — tests selector precision |
| 3 | St. David's North Austin Medical Center | HCA | Regional variety within one parent site |
| 4 | Dell Seton Medical Center at UT | Ascension Seton | Different portal structure (state → hospital hierarchy) |
| 5 | Ascension Seton Medical Center Austin | Ascension | Second Ascension target for heal diversity |
| 6 | Baylor Scott & White Medical Center – Austin | BSW | Standalone regional, different CMS footer pattern |

**Discovery method (manual, before coding):** CMS root `.txt` file or footer link **"Price Transparency"** → follow to MRF JSON/CSV. Record URLs in `targets.yaml` as `mrf_seed_url` (fallback only; collector is authoritative).

---

## Bright Data integration

### CLI commands (primary)

```bash
# Create collector (once per hospital)
bdata scraper create <price_transparency_url> \
  "Find the CMS machine-readable price file (MRF). Follow footer 'Price Transparency'. Return direct .json download URL for <facility name>."

# Run collector
bdata scraper run <collector_id> <seed_url> --json

# Self-heal when validation fails
bdata scraper heal <collector_id> "<specific reason from validate_output()>" --auto-approve --auto-save
```

### REST API (headless / approval fallback)

| Step | Endpoint |
|------|----------|
| Trigger heal | `POST /dca/collectors/{id}/refactor_template` body `{ "prompt": "..." }` |
| Poll progress | `GET /dca/collectors/{id}/refactor_template/progress` |
| Auto-approve | `POST /dca/collectors/{id}/resume_automation_job` body `{ "message": true, "auto_save": true }` |
| Run collector | `POST /dca/trigger_immediate` + `GET /dca/get_result` |

Auth: `Authorization: Bearer <API_KEY>`

### Scraper Studio "functions" (navigate, fill forms)

No hand-written Playwright API. Describe behavior in **create/heal prompts**; Bright Data AI Agent generates `page.click()`, `page.fill()`, `page.waitForSelector()` inside the collector template.

Example heal prompt (specific, <1000 chars):
> The collector failed to find the MRF. Validation: {reason}. Follow footer link 'Price Transparency', select 'St. David's Medical Center' from the facility list, return direct .json URL from blob storage — not a page URL.

---

## Autonomous heal loop (must be wired, not manual)

```python
def watchdog_pass(hospital_id: str) -> str:
    collector_id = targets[hospital_id]["collector_id"]
    emit_sse("page_loaded", hospital_id)

    discovered = run_collector(collector_id, seed_url, hospital_name)
    mrf_url = discovered.get("mrf_url") or targets[hospital_id]["mrf_seed_url"]

    raw = download_file(mrf_url)          # plain HTTP — no BD credits
    rows = normalize_file(raw, hospital_id)
    ok, reason = validate_output(rows, EXPECTED_PROCEDURES)

    if ok:
        upsert_to_db(rows)
        emit_sse("price_extracted", hospital_id, rows)
        return "healthy"

    emit_sse("extraction_failed", hospital_id, detail=reason)

    emit_sse("heal_triggered", hospital_id, detail=reason)
    heal_collector(collector_id, reason, auto_approve=True)
    emit_sse("heal_resumed", hospital_id)

    rows2 = run_collector_and_normalize(collector_id)
    ok2, reason2 = validate_output(rows2, EXPECTED_PROCEDURES)
    log_heal_event(collector_id, rows, rows2, reason, ok2)

    if ok2:
        upsert_to_db(rows2)
        emit_sse("price_extracted", hospital_id, rows2)
        return "healed"

    return "needs_manual_review"
```

**Never loop heal indefinitely.** One heal attempt → reverify → alert human.

---

## SSE event contract (backend → frontend)

```typescript
type ScraperEvent =
  | "page_loaded"        // collector started, navigating target
  | "price_extracted"    // validation passed, prices available
  | "extraction_failed"  // validate_output failed
  | "rate_limited"       // Bright Data throttled (retry with backoff)
  | "heal_triggered"     // heal_collector() called
  | "heal_resumed";      // heal complete, re-running collector

type NodeStatus = "idle" | "active" | "complete" | "broken" | "healing";
```

Frontend **must** handle all events. `healing` node status during `heal_triggered` → `heal_resumed`.

---

## UI requirements (ScrapeCanvas)

Respect `.cursor/rules/clearweb-design.mdc`: no zoom/spring on SVG `<g>`, accent `#34d399`, body ≥16px.

| Event | Animation |
|-------|-----------|
| `page_loaded` | Strand stroke-dash animates toward node |
| `price_extracted` | Node accent ring pulse, crawler dot arrives |
| `extraction_failed` | Node → `broken`, warn stroke |
| `heal_triggered` | Node → `healing`, dashed rotating ring (info color) |
| `heal_resumed` | Strand rewires, node → `active` → `complete` |
| Progress | Bar width + "N of M hospital sites" |

Timeline labels (human, not JSON):
- "Checking price page…"
- "Price found"
- "Page layout changed — self-healing…"
- "Healed — retrying…"

Failed state UI required (`scrapeStatus === "failed"`).

---

## Demo backup plan — don't bet on organic timing

**Do both:**

1. **Watcher (start days before demo):** `python scraper/watcher.py --interval 6h` logs every run to `scraper/data/watcher_log.jsonl`. If a real site change happens, you have a **timestamped, unscripted** heal event for judges.

2. **Manual fallback (live on stage):** DevTools DOM edit on one target to break a selector, then trigger heal in the app. Frame honestly: *"Here's what happens when a site changes — we caught one organically Tuesday at 3am; let me show the same flow live."*

---

## Env vars (unified)

| Variable | Where | Notes |
|----------|-------|-------|
| `BRIGHTDATA_API_KEY` | `scraper/.env` | Python pipeline + CLI |
| `BRIGHT_DATA_API_TOKEN` | `backend/.env` | Node backend (same key) |
| `SCRAPER_PYTHON` | `backend/.env` | Optional: path to venv python |
| `WATCHER_INTERVAL_HOURS` | `scraper/.env` | Default 6 |

---

## Non-goals (do not scope-creep)

- PDF parsing of chargemaster documents
- Multi-state hospital coverage beyond Austin metro
- Replacing Aria voice onboarding
- Building a Scraper Studio IDE UI (use Bright Data dashboard for collector editing)
- Infinite heal retry loops
- Betting the demo solely on organic site breaks

---

## Phased task list

### Phase 0 — Setup (do first)
- [ ] Copy API key into `scraper/.env` and `backend/.env`
- [ ] `bash scripts/setup-brightdata.sh` (venv, CLI verify, optional MCP)
- [ ] Manually verify 6 Austin MRF URLs → fill `scraper/targets.yaml`
- [ ] Create collectors: `bash scripts/create-collectors.sh` (or one-by-one via CLI)

### Phase 1 — Discovery + pipeline
- [ ] `run_pipeline.py` works for all 6 Austin targets (`--use-seed` fallback OK initially)
- [ ] `validate_output()` passes for each hospital
- [ ] SQLite + FastAPI serve Austin prices

### Phase 2 — Autonomous heal + watcher
- [ ] Wire `watchdog_pass()` into pipeline (replace `sys.exit(2)` on validation fail)
- [ ] `watcher.py` runs on cron, logs to `watcher_log.jsonl`
- [ ] `check_and_approve_heal.py` as manual fallback for stuck approval gates

### Phase 3 — Node bridge + SSE
- [ ] `scrapeService.js` spawns Python, streams events to SSE
- [ ] Fix: setting token must NOT leave jobs stuck in `running`
- [ ] Map collector IDs → graph nodes n1–n6

### Phase 4 — Frontend live UI
- [ ] `useScrapeStream.ts` handles all 6 event types + `healing` status
- [ ] ScrapeCanvas strand/node animations per event table above
- [ ] Austin mock results → real pipeline results in ResultsView

### Phase 5 — Demo hardening
- [ ] Start watcher 3+ days before demo
- [ ] Rehearse manual DOM-break fallback
- [ ] Screen-record one organic heal from `data/heal_log.jsonl` if available

---

## Quick start after token is set

```bash
# 1. Full dev setup
bash scripts/dev-setup.sh
bash scripts/setup-brightdata.sh

# 2. Test one hospital
cd scraper && source .venv/bin/activate
python run_pipeline.py --hospital-id st_davids_medical_center_austin --use-seed

# 3. Start watcher (background)
python watcher.py --interval 6

# 4. Run app
cd backend && npm run dev
cd frontend && npm run dev
```
