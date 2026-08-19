# Chargemaster Radar — Full Project Context

### Event: WeMakeDevs "Into the Scrape-Verse" Hackathon (Aug 17–23, 2026)

This document consolidates everything discussed so far — the problem, feasibility, architecture,
how self-healing actually works, scope decisions (India, medical tourism), and the build plan —
into one reference.

---

## 1. The Problem

Since 2021, U.S. federal law (the Hospital Price Transparency Rule, 45 CFR Part 180) has required
every hospital in America — roughly 6,000 of them — to publish a **machine-readable file (MRF)**
listing actual negotiated prices for every procedure, drug, and service, for every insurance plan
they accept. This is meant to let patients avoid surprise bills and shop for care.

In practice, it's a mess:
- Hospitals technically comply but bury the files in different formats (JSON, CSV, XML, sometimes
  scanned PDFs), on different subdomains, updated on no fixed schedule.
- No standard naming for the same procedure — one hospital lists CPT code `70551`, another writes
  `MRI-BRAIN-WO-CONTRAST`, another just writes free text like "brain scan."
- A large share of hospitals are still non-compliant or publish technically-present-but-unusable
  files, and CMS enforcement is light relative to the scale of the requirement.
- No consumer product has solved this at scale — it's considered too fragmented to aggregate
  cleanly, which is exactly the hackathon opportunity.

**Update as of July 1, 2024:** hospitals' MRFs must now conform to one of three CMS-sanctioned
template layouts (CSV "tall," CSV "wide," or JSON), which reduces *some* of the chaos for newly
compliant files — but plenty of legacy/non-compliant files still exist, and location/discoverability
is still entirely inconsistent hospital-to-hospital.

**A built-in discovery aid exists and matters a lot for this project:** CMS requires every hospital
to publish (a) a `.txt` file in their site's root folder naming the MRF's location, source page,
and hospital contact info, and (b) a footer link literally labeled "Price Transparency" on every
page including the homepage, linking to the page that hosts the MRF link. This is your discovery
scraper's starting point — check the root `.txt` file first, fall back to the footer link.

---

## 2. Who This Serves

- **Patients with high-deductible plans** shopping for plannable, non-emergency procedures
  (imaging, colonoscopies, joint replacements, maternity care) where price differences between
  nearby hospitals can be enormous.
- **Uninsured/self-pay patients**, for whom the negotiated cash-price spread between hospitals is
  often dramatic and currently undiscoverable without calling billing departments directly.
- **Employers/benefits teams and brokers** trying to steer employees toward lower-cost,
  same-quality providers — a real cost lever companies currently do manually or not at all.
- **Journalists and researchers** who want to report on price disparities but can't easily pull
  usable numbers from the current format chaos.
- **Policy/consumer advocacy groups** acting as watchdogs given light CMS enforcement.

This is not scraping to get around access restrictions — hospitals are legally required to publish
this data publicly, for free, no login wall. The problem is entirely format chaos and
discoverability, not permission. That's precisely why a self-healing scraper (one that
re-locates/re-adapts when a hospital's site changes) is the right engineering approach rather than
a nice-to-have — a hardcoded per-hospital scraper breaks constantly against sites that were never
built for machine consumption.

---

## 3. Hackathon Constraints (Scrape-Verse specifically)

- The scraper **must** be built using Bright Data's **Scraper Studio** — hard submission
  requirement, not optional tooling.
- Data must be **publicly accessible with no login wall** — hospital MRFs qualify cleanly.
- Coding starts after the hackathon's official start (Aug 17, 2026); working window is effectively
  through Aug 23.
- Judging rewards: best use of the Bright Data platform (including the self-healing story), a
  finished-feeling UI, and clean/structured code a stranger could follow.
- AI coding assistants (Claude Code, Cursor, Codex) are allowed but must be disclosed, and the team
  needs to be able to explain every part of what was built — "we don't know how our own scraper
  works" is a stated rejection risk.
- Targets can't duplicate Bright Data's 800+ pre-built scrapers for major sites — hospital
  chargemaster pages are obscure enough this isn't a concern.

---

## 4. Feasibility

The full "index all 6,000 hospitals" version is a multi-month data engineering project — that's
*why* nobody's solved it yet, not a reason to avoid the idea. What's achievable in the ~4-day
window is a **compelling, well-chosen slice**:

- **5–8 hospitals**, deliberately chosen for *format diversity*, not convenience:
  - 2–3 from a large multi-state system (cleaner format, "control group" for validating
    normalization logic)
  - 2–3 standalone/regional hospitals (more likely to have quirks — non-standard naming, odd
    subdomains, encoding issues)
  - 1 JS-heavy or file-browser-based site (best shot at a genuine mid-week "site changed under us"
    moment)
  - 1 "stretch" hospital where the `.txt`/footer method fails on first try (good demo material for
    what non-compliance looks like)
- **8–15 shoppable procedures** tracked across all of them (MRI brain, knee replacement,
  appendectomy, colonoscopy, ER visit level 3, etc.) rather than every line item in every file.

The demo narrative this produces: *"Hospital A publishes clean JSON, Hospital B publishes a
40MB headerless CSV, Hospital C changes their file URL mid-week — our scraper adapts and the price
stays comparable."* This maps directly onto the self-healing judging criterion.

---

## 5. Architecture

```
[Discovery]          [Ingest]              [Normalize]         [Serve]
Scraper Studio  →   file downloader   →   schema mapper   →   FastAPI/Postgres  →  Next.js UI
(finds MRF URL)     (JSON/CSV/XML/PDF)    (code → CPT,        (search + compare)
                                            fuzzy proc names)
```

**Discovery** — Scraper Studio's job. Visits the hospital site, checks the root `.txt` file, falls
back to the footer "Price Transparency" link, resolves the current MRF URL. This is the only stage
that genuinely needs AI-driven resilience, because it's the stage that breaks when a hospital
redesigns their site.

**Ingest** — once you have the URL, a plain HTTP GET. No Bright Data credits needed here; save
those for discovery and healing.

**Normalize** — the hardest part. Maps each hospital's procedure naming (CPT code, internal SKU, or
free text) onto one shared schema so "MRI Brain" means the same thing regardless of source. Row
shape:
```
{procedure_code, procedure_name, hospital_id, payer, price, price_type, source_url, scraped_at}
```
Use a small hand-curated procedure dictionary for your 8–15 target procedures rather than building
general medical NLP.

**Serve** — FastAPI + Postgres (SQLite is fine for hackathon scale) backend; Next.js (or any
lightweight React) frontend. The core visual payoff is a price-comparison table/chart — e.g. "MRI
brain: $450 at Hospital A vs. $2,100 at Hospital B" — since that single view sells the whole
project to judges.

---

## 6. How Scraper Studio Helps You Build

Two build modes, same underlying scraper:
1. **AI Agent mode** — describe the data you want in plain language; the AI generates extraction
   logic and schema. No manual selectors.
2. **JS IDE mode** — hand-edit the extraction JavaScript for finer control (needed for hospitals
   with unusual file-picker widgets or JS-rendered listings).

You can start in AI Agent mode and drop into the IDE for the few hospitals that need
special-casing. Scraper Studio also runs on Bright Data's proxy/unblocking infrastructure, so IP
blocks and JS rendering aren't something you need to handle yourself.

---

## 7. How Scraping Works, In Plain Terms

A webpage is HTML — a tree of tags. A scraper downloads that raw HTML and uses a **selector**
(e.g. "find every element with class `price-row`, grab the text inside `proc-name` and
`proc-price`") to pull out the fields you want.

Scrapers break when a site's structure changes — e.g. `<div class="price-row">` becomes a plain
`<tr><td>` table row. The information is identical to a human reading the page, but the selector
matches nothing anymore. This isn't a crash; it's silent — the scraper returns empty or garbage
data while believing it followed its instructions correctly. That silent-failure property is why
detection has to be a deliberate, separate step (see §8) — nobody notices a hospital going dark for
weeks without one.

---

## 8. How Self-Healing Actually Works (LLM-Involved, Human-Approved by Default)

- Each scraper you create gets a **Collector ID**. When output looks broken, you run a `heal`
  command with the collector ID and a prompt describing exactly what's wrong and what correct
  output should look like.
- Under the hood, an LLM reads the current scraper code plus the new page structure and **rewrites
  the extraction logic** — refactoring the existing template, not regenerating from scratch.
- By default this is **human-in-the-loop**: the AI proposes the fix as a diff and waits for
  approval before applying it. An `--auto-approve` flag is what makes it apply automatically.
- **Critical gap:** the AI only handles the "fix it" half. It never decides on its own that a
  scraper is broken — you (or your own watchdog code) have to inspect output and make that call.
  Detection is entirely your responsibility to build.

**Practical risk to know about:** an auto-approved heal can fix the *structure* (schema looks
right, fields populate) while getting the *semantics* wrong — e.g. now pulling list price instead
of negotiated price, because both live in similarly-shaped table cells. A structural validator
won't catch this; only a plausibility check (price didn't jump implausibly vs. last known value)
has a shot at it.

### The watchdog layer you have to build yourself

```python
def create_collector(hospital_id, seed_url, prompt) -> str: ...
def run_collector(collector_id) -> dict: ...
def validate_output(rows, expected_procedures) -> tuple[bool, str]: ...
def heal_collector(collector_id, reason, auto_approve=True) -> dict: ...
def reverify(collector_id, expected_procedures) -> bool: ...
def check_price_plausibility(rows, historical) -> list[dict]: ...  # stretch
def log_heal_event(collector_id, before, after, reason, success) -> None: ...
```

Loop shape: **detect → heal → re-verify → alert if still broken.** Never trust a heal without
re-checking it, and never loop heal calls indefinitely on failure — alert a human instead.

Recommended build order given the time budget: plain three-piece loop with `--auto-approve` first
(structural detection only), get it working end-to-end on 2–3 hospitals, then add the
implausible-price-jump check as a stretch goal if time allows.

---

## 9. Credit Budget Plan

Total available: **$100** ($50 × 2 accounts). Scraper Studio runs roughly $1/1,000 requests for
page fetches; AI-generation (scraper creation) may be metered separately — verify actual burn after
your first 2–3 collectors before locking this plan in.

| Bucket | Budget | Purpose |
|---|---|---|
| Core build & iteration | $50 | Creating + testing collectors for 6–8 hospitals. Each hospital: 1 discovery run + 2–3 iteration passes. |
| Deliberate self-heal demos | $20 | Reserved specifically for breaking/healing runs you'll screen-record. Protect this bucket. |
| Buffer | $20 | Unplanned re-runs, a weirder-than-expected hospital site, last-day fixes. |
| Medical tourism stretch (optional) | $10 | Only touch once core US flow is fully working. |

**Rule of thumb:** file downloads don't need to go through Bright Data — once discovery gives you
a direct URL, a plain HTTP GET is free. Reserve credits for discovery and healing, not for pulling
multi-hundred-MB files.

**Checkpoint:** after your first 3 hospitals are built, check actual dashboard spend and
recalculate whether 6–8 hospitals is still realistic. Cut scope here, not later.

At $1/1,000 requests, $100 is a rough ceiling of ~100,000 simple page requests — but your real
usage is concentrated in discovery (1–5 requests per hospital per run), so even generous
iteration/healing per hospital should land well under $5–10 each, leaving room for 20–40 hospital
scrapers if you wanted that many. Hospital *count* isn't the goal, though — 5–8 well-chosen,
genuinely different hospitals tells a better story than many near-identical ones.

---

## 10. India Scope

India has a rate-transparency requirement too, but weaker and less standardized than the US:

- Under the **Clinical Establishments (Registration and Regulation) Act, 2010**, Rule 9(i), every
  establishment must display rates for each service at a conspicuous place (and in practice, on
  their website), in local and English languages.
- Adopted in 19 states/UTs directly, with 17 more states running their own equivalent laws —
  almost all require rate display, but with **no standardized format**.
- Kerala's High Court recently upheld this requirement against a hospital-association legal
  challenge, explicitly comparing it to US/EU transparency standards — a live, current issue.

**Key difference from the US:** India has no machine-readable-file mandate at all — just "display
rates," which in practice means a PDF, a photographed rate card, an HTML table, or sometimes
nothing findable. There's also no CPT-equivalent code system.

This is actually a *stronger* self-healing-scraper argument, not a weaker one — with no structured
fallback file, every Indian hospital is closer to your worst-case US hospital. Good pitch line:
*"We started with US hospitals because CMS gives a baseline to validate correctness against, but
the same scraper approach applies directly to India, where there isn't even a machine-readable
format mandate."*

**Recommendation:** stay US-focused for the core demo (CMS's mandate gives you a known-good format
to validate against, de-risking normalization); mention India as the "where this goes next" slide
rather than building it out in the 4-day window.

---

## 11. Medical Tourism Add-On

Feasible as a genuine feature, but the data source is fundamentally different from the US MRF
pipeline and should be treated as a **separate, smaller add-on** rather than merged into the core
normalized schema.

**Why it's different:**
- What's actually publicly available is mostly **facilitator/broker aggregator sites**, not
  hospitals directly disclosing structured rates the way US MRFs are legally required to.
  Individual destination hospitals (Bumrungrad, Apollo, Fortis, Anadolu Medical Center) mostly
  publish marketing copy and "starting from $X" language rather than clean package price lists —
  verify a given hospital actually has a scrapable price page before committing to it.
- A US negotiated insurance rate and a Thailand/India "all-inclusive package" (surgery + hospital
  stay + sometimes hotel/translator/follow-up) aren't directly comparable — showing them side by
  side without a clear "what's included" caveat risks looking naive about your own data.

**Recommended scope, if time allows:**
- 4–6 hospitals with verified public package pages, 4–5 classic medical-tourism procedures (knee
  replacement, heart bypass/valve, dental implants, IVF, hair transplant).
- Store as its own `international_packages` table (hospital, country, procedure, package price,
  what's included) — don't blend into the CPT-normalized US table.
- Frontend: a distinct "compare abroad" panel below the domestic comparison, clearly labeled as
  package pricing, not merged into the same sortable list.

**Why it's still good for the hackathon story despite the caveats:** these are diverse
international site structures, so they stress-test the discovery scraper on new layouts without
touching core normalization logic — a good "if we finish early" addition, and a strong closing
slide (e.g. a US patient priced out of a $40K knee replacement discovers a JCI-accredited option at
a fraction of the cost). Gate this on core US completion — a fully working US comparison tool with
a clean self-healing demo beats a half-working version of both.

---

## 12. Immediate Next Actions, In Order

1. Confirm Bright Data credits + CLI auth working.
2. Manually find and verify 6–8 real hospital MRF URLs via the `.txt`/footer method; write into
   `targets.yaml`.
3. Build the full discover → ingest → normalize → validate → serve loop for hospital #1 only.
4. Once hospital #1 works end-to-end, loop across the rest of the target list.
5. Build the watchdog + heal functions; test on a deliberately-broken collector; screen-record it.
6. Only then: frontend polish, India/medical-tourism stretch goals.
