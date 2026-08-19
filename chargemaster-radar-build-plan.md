# Chargemaster Radar — Build Plan
### Into the Scrape-Verse Hackathon (Aug 17–23, 2026)

---

## 1. Credit Budget Plan

Total available: **$100** ($50 × 2 accounts). Scraper Studio runs roughly $1/1,000 requests for
page fetches; AI-generation (scraper creation) may be metered separately — verify actual burn
after your first 2–3 collectors before locking this plan in.

| Bucket | Budget | Purpose |
|---|---|---|
| Core build & iteration | $50 | Creating + testing collectors for 6–8 hospitals. Each hospital: 1 discovery run + 2–3 iteration passes while you get the AI Agent's field extraction right. |
| Deliberate self-heal demos | $20 | Reserved specifically for breaking/healing runs you'll screen-record. Don't dip into this for regular debugging — protect it. |
| Buffer | $20 | Unplanned re-runs, a hospital site turning out weirder than expected, last-day panic fixes. |
| Medical tourism stretch (optional) | $10 | Only touch this once core US flow is fully working end-to-end. |

**Rule of thumb:** file downloads (the actual MRF JSON/CSV/XML) don't need to go through
Bright Data at all — once discovery gives you a direct URL, a plain HTTP GET is free. Reserve
Scraper Studio credits for the *discovery* step (finding/verifying the file link) and the
*healing* step, not for pulling the multi-hundred-MB files themselves.

**Checkpoint:** after your first 3 hospitals are built, check actual dashboard spend and
recalculate whether 6–8 hospitals is still realistic. Cut scope here, not later.

---

## 2. Target Hospitals — how to pick them, not fixed URLs

I'm not going to hand you a fixed URL list — MRF locations move, and picking your real targets is
itself the first useful task of the hackathon (and something you should verify live rather than
trust from training data). Use this method instead:

**Discovery method per candidate hospital:**
1. Check `hospital-domain.com/[root]/[something].txt` — CMS requires this file naming the MRF
   location, its source page, and hospital contact info.
2. If not found immediately, look for a **footer link literally labeled "Price Transparency"**
   on the hospital homepage — CMS mandates this link on every page including the homepage.
3. From there, follow through to the actual MRF file (CSV "tall", CSV "wide", or JSON —
   these are the three CMS-sanctioned template formats as of July 2024).

**Selection criteria — pick for format diversity, not convenience:**
- 2–3 hospitals from a large multi-state system (more likely compliant, cleaner format, good
  as your "control group" to validate normalization logic against)
- 2–3 standalone/regional hospitals (more likely to have quirks — different subdomain,
  non-standard file naming, occasional CSV encoding issues)
- 1 hospital you specifically pick because their site looks JS-heavy or file-browser-based
  (your best shot at a genuine mid-week "site changed under us" moment)
- 1 "stretch" hospital where the .txt/footer method fails on first try — good material for
  showing judges what non-compliance actually looks like in your demo narrative

**Action item before you write any code:** spend 30–45 minutes manually finding and bookmarking
the actual current MRF URL for each of your 6–8 candidates using the method above. Write them
into a `targets.yaml` in your repo. This lets discovery-scraper development start from a known
URL rather than building general hospital-site-crawling logic you don't have time for.

```yaml
# targets.yaml
hospitals:
  - id: hosp_01
    name: "Example Regional Medical Center"
    homepage: "https://example-hospital.org"
    mrf_seed_url: ""   # fill in after manual discovery
    format_hint: ""    # json | csv_tall | csv_wide | unknown
```

---

## 3. First Loop — end-to-end for ONE hospital

Build this fully for hospital #1 before touching #2–8. This is your pipeline shape validation.

```
STEP 1 — Discover
  seed_url = targets.yaml[hospital].homepage
  collector_id = create_collector(hospital_id, seed_url,
                    prompt="Find the current URL of the machine-readable price
                            transparency file (MRF) linked from the footer
                            'Price Transparency' link or root .txt file")
  discovered = run_collector(collector_id)
  mrf_url = discovered["mrf_url"]

STEP 2 — Ingest (no Bright Data credits needed here)
  raw_path = download_file(mrf_url)   # plain HTTP GET, stream to disk

STEP 3 — Normalize
  rows = normalize_file(raw_path, hospital_id, format_hint)
  # rows: list of {procedure_code, procedure_name, payer, price, price_type, source_url, scraped_at}

STEP 4 — Validate (this is your watchdog — see §4)
  ok, reason = validate_output(rows, expected_procedures)

STEP 5a — If ok: persist
  upsert_to_db(rows)

STEP 5b — If not ok: heal
  heal_collector(collector_id, reason, auto_approve=True)
  discovered = run_collector(collector_id)   # re-run after heal
  rows = normalize_file(...)
  ok2, reason2 = validate_output(rows, expected_procedures)
  log_heal_event(collector_id, before=raw_path, after=rows, reason=reason, success=ok2)
  if ok2: upsert_to_db(rows)
  else: alert("heal did not resolve — needs manual review")

STEP 6 — Serve
  FastAPI reads from DB, frontend queries by procedure/hospital
```

Get steps 1–6 working for one hospital, confirm a row shows up correctly in your API response,
*then* loop this across the rest of `targets.yaml`.

---

## 4. Self-Healing Automation — the functions you actually need

This is the differentiator the judges are told to look for, so build it as real code, not a
manual step you do by hand during the demo.

```python
def create_collector(hospital_id: str, seed_url: str, prompt: str) -> str:
    """Wraps `brightdata scraper create <url> "<prompt>"`. Returns collector_id."""

def run_collector(collector_id: str) -> dict:
    """Runs the collector, returns structured output (JSON/CSV/NDJSON per config)."""

def validate_output(rows: list[dict], expected_procedures: set[str]) -> tuple[bool, str]:
    """
    The detector. Runs after every scrape. Checks, in order:
      1. Empty result -> broken
      2. >30% of rows missing price field -> broken
      3. Expected procedure codes not found at all -> broken
      4. Price values outside a sane range for that procedure (e.g. $0 or >$500k) -> broken
    Returns (is_valid, human_readable_reason_string).
    The reason string IS the heal prompt — write it specifically, not vague.
    """

def heal_collector(collector_id: str, reason: str, auto_approve: bool = True) -> dict:
    """
    Wraps `brightdata scraper heal <collector_id> "<reason>" [--auto-approve]`.
    reason must name exactly what's wrong and what correct output should look like
    (per Bright Data's own guidance — vague prompts produce vague heals).
    """

def reverify(collector_id: str, expected_procedures: set[str]) -> bool:
    """Re-runs validate_output() after a heal. This is the safety net —
    never trust a heal without re-checking it. If still broken, alert
    a human instead of looping heal calls indefinitely."""

def check_price_plausibility(rows: list[dict], historical: dict) -> list[dict]:
    """
    Stretch check: flag any procedure whose price jumped >5x vs. last known
    good value for that hospital+procedure. Catches a heal that's confidently
    wrong (e.g. now pulling list price instead of negotiated price) even
    though the schema looks structurally fine.
    """

def log_heal_event(collector_id, before_sample, after_sample, reason, success) -> None:
    """
    Writes a timestamped record: what broke, what the fix prompt was,
    before/after sample rows, whether reverify passed. This log IS your
    demo footage — screen-record a live heal event using this output.
    """
```

**Watchdog loop wrapper** (run this on a schedule or manually trigger for the demo):

```python
def watchdog_pass(hospital_id: str):
    collector_id = get_collector(hospital_id)
    rows = run_collector_and_normalize(collector_id)
    ok, reason = validate_output(rows, expected_procedures[hospital_id])
    if ok:
        upsert_to_db(rows)
        return "healthy"
    heal_collector(collector_id, reason, auto_approve=True)
    rows2 = run_collector_and_normalize(collector_id)
    ok2, reason2 = validate_output(rows2, expected_procedures[hospital_id])
    log_heal_event(collector_id, rows, rows2, reason, ok2)
    if ok2:
        upsert_to_db(rows2)
        return "healed"
    alert(f"{hospital_id}: heal failed — {reason2}")
    return "needs_manual_review"
```

**For your demo specifically:** deliberately force a break on 1–2 collectors partway through the
week (e.g. by pointing one at a slightly different page structure, or waiting for a real site
change) so you have a genuine before/after heal event captured on video — this is worth more to
your score than any UI polish.

---

## Immediate next actions, in order

1. Confirm Bright Data credits + CLI auth working
2. Fill in `targets.yaml` with 6–8 real, manually-verified MRF URLs
3. Build steps 1–6 above for hospital #1 only
4. Once hospital #1 works end-to-end, loop across the rest
5. Build the watchdog + heal functions, test on a deliberately-broken collector
6. Only then: frontend polish, medical tourism stretch
