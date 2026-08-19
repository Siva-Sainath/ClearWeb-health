# -*- coding: utf-8 -*-
"""
demo_heal.py
============
Step 8 -- Self-healing demo script (standalone, does NOT touch run_pipeline.py).

This script demonstrates the full detect -> heal -> reverify -> log loop using a
deliberately-broken collector, producing console output clean enough to screen-record.

WHAT THIS DOES:
  1. create_collector() -- new collector pointed at the bare homepage with a vague prompt
                           designed to fail (no specific footer-link instruction)
  2. run_collector()    -- runs it; output will be empty or point to the wrong page
  3. normalize + validate_output() -- catches the failure, produces a specific reason string
  4. heal_collector()   -- sends that reason as the heal prompt (auto_approve=True)
  5. run_collector() again -> normalize -> validate -> reverify()
  6. log_heal_event()   -- writes to DB heal_events + prints screen-recordable console block
  7. "NEEDS MANUAL REVIEW" block if reverify still fails (no infinite loop)

Run with:
    python demo_heal.py

Requirements:
  - BRIGHTDATA_API_KEY must be set in .env (or environment)
  - Collector creation and runs consume Bright Data credits (discovery budget)
"""

import io
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 output so checkmarks / box chars render correctly on any terminal.
# This is safe -- if stdout doesn't support reconfigure (rare), we fall back silently.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

# -- project imports ----------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent))

from collectors.brightdata import create_collector, run_collector
from db.store import init_db, insert_heal_event
from pipeline.normalize import normalize_file, TRACKED_CODES
from pipeline.validate import EXPECTED_PROCEDURES, validate_output
from pipeline.heal import heal_collector, reverify, log_heal_event
from pipeline.ingest import download_file

# -- logging: INFO to console, clean format -----------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("demo_heal")

# -- constants ----------------------------------------------------------------
HOSPITAL_ID = "hca_houston_medical_center"
HOMEPAGE    = "https://www.hcahoustonhealthcare.com/"

# Deliberately vague prompt -- no footer-link instruction, no format guidance.
# This is what a naive scraper creation looks like; it should fail to resolve
# an MRF file URL (or land on the wrong page entirely).
VAGUE_PROMPT = (
    "Find the pricing file for this hospital. "
    "Return a URL to any price-related document you can find."
)

# The precise heal prompt -- names exactly what was wrong and what correct
# output looks like. Per Bright Data's own guidance: vague prompts -> vague heals.
HEAL_PROMPT_TEMPLATE = (
    "The collector failed to find the machine-readable file (MRF). "
    "Specifically: {reason} "
    "The correct output is the direct download URL of the hospital's CMS-compliant "
    "price transparency JSON file, reached by following the footer link labeled exactly "
    "'Price Transparency' on the homepage, then selecting the link for "
    "'HCA Houston Healthcare Medical Center' from the list of facilities. "
    "The URL should point to a .json file hosted at "
    "stctrprodsnsvc00455826e6.blob.core.windows.net "
    "and must be a direct download link, not a page URL."
)

W = 70  # console width for dividers


# -- display helpers ----------------------------------------------------------

def div(char="-", width=W):
    print(char * width)

def section(title):
    print()
    div("=")
    print(f"  {title}")
    div("=")

def subsection(title):
    print()
    div("-")
    print(f"  {title}")
    div("-")

def wordwrap(text, indent="    ", width=66):
    """Print text word-wrapped at `width`, with `indent` on each line."""
    words = text.split()
    line = indent
    for word in words:
        if len(line) + len(word) + 1 > width:
            print(line)
            line = indent + word + " "
        else:
            line += word + " "
    if line.strip():
        print(line)

def print_rows(rows, label, n=3):
    subsection(label)
    if not rows:
        print("  (no rows)")
        return
    for r in rows[:n]:
        print(f"  CPT {r.get('procedure_code','?'):6s}  "
              f"{r.get('payer','?')[:35]:35s}  "
              f"${r.get('price', 0):>10,.2f}  "
              f"{r.get('price_type','?')}")
    if len(rows) > n:
        print(f"  ... and {len(rows) - n} more rows")

def print_validation(ok, reason):
    if ok:
        print("  [PASS]  VALIDATION PASSED")
    else:
        print("  [FAIL]  VALIDATION FAILED")
        print(f"\n  REASON (this becomes the heal prompt):\n")
        wordwrap(reason)


# -- normalise a downloaded file, return rows ---------------------------------

def download_and_normalize(mrf_url, label):
    """Download mrf_url, stream-normalise, return rows. Returns [] on any error."""
    if not mrf_url:
        return []
    try:
        raw_path = download_file(mrf_url, label)
        return normalize_file(
            raw_path,
            hospital_id=HOSPITAL_ID,
            format_hint="json",
            source_url=mrf_url,
            filter_codes=TRACKED_CODES,
        )
    except Exception as exc:
        print(f"  Download/normalize error: {exc}")
        return []


# -- main heal demo -----------------------------------------------------------

def main():
    init_db()
    ts_start = time.monotonic()

    print()
    div("#")
    print("  CHARGEMASTER RADAR -- SELF-HEAL DEMO")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    div("#")

    # -- STEP 1: Create a deliberately weak collector -------------------------
    section("STEP 1 -- Create deliberately-weak collector (vague prompt)")
    print(f"  Hospital homepage : {HOMEPAGE}")
    print(f"  Vague prompt      : {VAGUE_PROMPT!r}")
    print()
    print("  Creating collector via Bright Data CLI ...")

    try:
        weak_collector_id = create_collector(
            hospital_id=f"{HOSPITAL_ID}_broken",
            seed_url=HOMEPAGE,
            prompt=VAGUE_PROMPT,
        )
    except (RuntimeError, EnvironmentError) as exc:
        logger.error(f"create_collector() failed: {exc}")
        print("\n  [!] Cannot create collector -- is BRIGHTDATA_API_KEY set in .env?")
        sys.exit(1)

    print(f"  [OK] Weak collector created: {weak_collector_id}")

    # -- STEP 2: Run it -- expect failure -------------------------------------
    section("STEP 2 -- Run weak collector (expecting failure)")
    print("  Running collector ...")

    broken_mrf_url = ""
    broken_rows = []

    try:
        result = run_collector(weak_collector_id, HOMEPAGE, "HCA Houston Healthcare Medical Center")
        broken_mrf_url = result.get("mrf_url", "")
        print(f"  Collector output: mrf_url = {broken_mrf_url!r}")
        if broken_mrf_url:
            print("  Attempting to download and normalize ...")
            broken_rows = download_and_normalize(broken_mrf_url, f"{HOSPITAL_ID}_broken")
        else:
            print("  No usable URL returned -- collector output was empty or wrong page.")
    except RuntimeError as exc:
        print(f"  run_collector() error (expected for a vague prompt): {exc}")

    print_rows(broken_rows, f"BROKEN OUTPUT ({len(broken_rows)} rows)")

    # -- STEP 3: validate_output() catches the failure ------------------------
    section("STEP 3 -- Validate broken output")
    ok_before, reason = validate_output(broken_rows, EXPECTED_PROCEDURES)
    print_validation(ok_before, reason)

    if ok_before:
        print("\n  [!] Validation unexpectedly passed -- the vague prompt actually worked.")
        print("      Try re-running with a different seed or wait for a real site change.")
        sys.exit(0)

    # -- STEP 4: Heal ---------------------------------------------------------
    section("STEP 4 -- Heal collector")
    heal_prompt = HEAL_PROMPT_TEMPLATE.format(reason=reason)

    print("  Heal prompt:\n")
    wordwrap(heal_prompt)
    print()
    print("  Calling heal_collector(auto_approve=True) ...")

    try:
        heal_result = heal_collector(
            collector_id=weak_collector_id,
            reason=heal_prompt,
            auto_approve=True,
        )
        print(f"  [OK] Heal complete: {heal_result}")
    except (RuntimeError, EnvironmentError) as exc:
        logger.error(f"heal_collector() failed: {exc}")
        print(f"\n  [FAIL] Heal call failed: {exc}")
        sys.exit(1)

    # -- STEP 5: Re-run after heal --------------------------------------------
    section("STEP 5 -- Re-run healed collector")
    print("  Running collector again after heal ...")

    healed_mrf_url = ""
    healed_rows = []

    try:
        result2 = run_collector(weak_collector_id, HOMEPAGE, "HCA Houston Healthcare Medical Center")
        healed_mrf_url = result2.get("mrf_url", "")
        print(f"  Collector output: mrf_url = {healed_mrf_url!r}")
        if healed_mrf_url:
            healed_rows = download_and_normalize(healed_mrf_url, f"{HOSPITAL_ID}_healed")
        else:
            print("  Still no usable URL after heal.")
    except RuntimeError as exc:
        print(f"  run_collector() error after heal: {exc}")

    print_rows(healed_rows, f"HEALED OUTPUT ({len(healed_rows)} rows)")

    # -- STEP 6: Reverify -----------------------------------------------------
    section("STEP 6 -- Reverify after heal")
    _, reason_after = validate_output(healed_rows, EXPECTED_PROCEDURES)
    reverify_passed = reverify(weak_collector_id, healed_rows, EXPECTED_PROCEDURES)

    if reverify_passed:
        print("  [PASS]  REVERIFY PASSED -- heal resolved the issue")
    else:
        print("  [FAIL]  REVERIFY FAILED -- heal did not resolve the issue")
        print(f"  Remaining failure: {reason_after[:120]}")

    # -- STEP 7: Log the event ------------------------------------------------
    section("STEP 7 -- Log heal event")
    timestamp = datetime.now(timezone.utc).isoformat()

    log_heal_event(
        collector_id=weak_collector_id,
        before_sample=broken_rows,
        after_sample=healed_rows,
        reason=reason,
        success=reverify_passed,
    )
    insert_heal_event(
        timestamp=timestamp,
        collector_id=weak_collector_id,
        reason=reason,
        success=reverify_passed,
        before_sample=broken_rows,
        after_sample=healed_rows,
    )

    print(f"  [OK] Logged to data/heal_log.jsonl")
    print(f"  [OK] Logged to data/chargemaster.db -> heal_events table")

    # -- FINAL SUMMARY (screen-record this) -----------------------------------
    elapsed = time.monotonic() - ts_start
    section("SUMMARY -- BEFORE / AFTER")

    subsection("BEFORE (broken collector output)")
    if broken_rows:
        for r in broken_rows[:3]:
            print(f"  CPT {r['procedure_code']:6s}  "
                  f"{r['payer'][:35]:35s}  "
                  f"${r['price']:>10,.2f}")
    else:
        print("  (empty -- no rows returned by broken collector)")

    subsection("VALIDATE_OUTPUT() FAILURE REASON")
    wordwrap(reason)

    subsection("HEAL PROMPT SENT TO BRIGHT DATA")
    wordwrap(heal_prompt)

    subsection("AFTER (healed collector output)")
    if healed_rows:
        for r in healed_rows[:3]:
            print(f"  CPT {r['procedure_code']:6s}  "
                  f"{r['payer'][:35]:35s}  "
                  f"${r['price']:>10,.2f}")
    else:
        print("  (empty -- heal did not resolve the URL issue)")

    subsection("REVERIFY RESULT")
    if reverify_passed:
        print("  [PASS]  REVERIFY PASSED -- self-healing confirmed working")
    else:
        print()
        div("#")
        print("  [!]  NEEDS MANUAL REVIEW")
        print(f"  Collector {weak_collector_id} is still broken after one heal attempt.")
        print("  Do NOT retry heal in a loop -- alert a human instead.")
        div("#")

    print()
    div("#")
    print(f"  Demo complete in {elapsed:.1f}s")
    print(f"  Weak collector ID  : {weak_collector_id}")
    print(f"  Heal event logged  : data/heal_log.jsonl + chargemaster.db")
    div("#")
    print()


if __name__ == "__main__":
    main()
