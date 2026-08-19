"""
pipeline/validate.py
====================
Step 4 — Validate normalizer output before persisting to DB.

GROUND TRUTH — 5 real, verifiable CPT line items for HCA Houston Healthcare Medical Center.
These were chosen because they appear in the file and have well-established price ranges.
Price ranges are deliberately wide to account for inpatient vs. outpatient and payer variance,
but tight enough to catch obvious extraction failures (zero prices, list-price confusion, etc.)

CPT    | Procedure                              | Min ($) | Max ($)
-------|----------------------------------------|---------|--------
70553  | MRI Brain w/ & w/o Contrast            |     500 |  15000
27447  | Total Knee Arthroplasty                |    3000 | 100000
99283  | Emergency Dept Visit Level 3           |     150 |   8000
45378  | Colonoscopy, diagnostic                |     300 |  12000
44950  | Appendectomy                           |    2000 |  80000

validate_output() checks, in order:
  1. Empty result → broken
  2. >30% rows missing price → broken
  3. None of the 5 expected CPT codes present in the result set → broken
  4. Any tracked procedure has a price outside its sane range → broken

Returns (is_valid: bool, reason: str).
reason is empty string when valid; otherwise it is written specifically enough to serve
as a Bright Data heal prompt — vague reasons produce vague heals.
"""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# Ground-truth expected procedures — hardcoded, do NOT auto-derive
# --------------------------------------------------------------------------

EXPECTED_PROCEDURES: dict[str, dict] = {
    "70553": {
        "name": "MRI Brain w/ & w/o Contrast",
        "min_price": 500.0,
        "max_price": 15_000.0,
    },
    "27447": {
        "name": "Total Knee Arthroplasty",
        "min_price": 3_000.0,
        "max_price": 100_000.0,
    },
    "99283": {
        "name": "Emergency Department Visit Level 3",
        "min_price": 150.0,
        "max_price": 8_000.0,
    },
    "45378": {
        "name": "Colonoscopy, Diagnostic",
        "min_price": 300.0,
        "max_price": 12_000.0,
    },
    "44950": {
        "name": "Appendectomy",
        "min_price": 2_000.0,
        "max_price": 80_000.0,
    },
}

# Fraction of rows allowed to have missing/zero price before we call it broken
MISSING_PRICE_THRESHOLD = 0.30


def validate_output(
    rows: list[dict],
    expected_procedures: dict[str, dict] | None = None,
) -> tuple[bool, str]:
    """
    Validate the list of normalised charge rows.

    Parameters
    ----------
    rows : list[dict]
        Output from normalize_file().
    expected_procedures : dict[str, dict] | None
        CPT-keyed ground truth. Defaults to EXPECTED_PROCEDURES for hospital #1.

    Returns
    -------
    (True, "")          — all checks passed
    (False, "<reason>") — first failing check, reason usable as a heal prompt
    """
    if expected_procedures is None:
        expected_procedures = EXPECTED_PROCEDURES

    # CHECK 1 — empty result
    if not rows:
        reason = (
            "The scraper returned zero rows. The MRF file may have moved, the collector "
            "may be pointing at the wrong URL, or the JSON structure changed. "
            "Re-discover the current MRF URL from the hospital's price transparency page "
            "and update the extraction to yield standard_charge_information entries with "
            "procedure_code, procedure_name, payer, and standard_charge_dollar fields."
        )
        logger.warning(f"[validate] FAIL — empty result: {reason}")
        return False, reason

    # CHECK 2 — >30% missing price
    missing_price = sum(1 for r in rows if not r.get("price") or r["price"] == 0)
    missing_fraction = missing_price / len(rows)
    if missing_fraction > MISSING_PRICE_THRESHOLD:
        pct = missing_fraction * 100
        reason = (
            f"{pct:.1f}% of extracted rows have a zero or missing price "
            f"(threshold: {MISSING_PRICE_THRESHOLD*100:.0f}%). "
            "The extractor may be reading the wrong column or the 'standard_charge_dollar' "
            "field path has changed. Confirm the correct field is "
            "'payers_information[n].standard_charge_dollar' inside 'standard_charges[]' "
            "inside each 'standard_charge_information[]' entry."
        )
        logger.warning(f"[validate] FAIL — {pct:.1f}% missing price: {reason}")
        return False, reason

    # Build a CPT → list[price] index for checks 3 & 4
    code_prices: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        code = row.get("procedure_code", "")
        price = row.get("price", 0)
        if code and price:
            code_prices[code].append(float(price))

    # CHECK 3 — none of the expected CPT codes present at all
    found_codes = set(code_prices.keys())
    expected_codes = set(expected_procedures.keys())
    missing_codes = expected_codes - found_codes
    if missing_codes:
        names = [expected_procedures[c]["name"] for c in missing_codes]
        reason = (
            f"Expected CPT codes not found in output: {sorted(missing_codes)} "
            f"({', '.join(names)}). "
            "Either the procedure_code field is not being populated from code_information[], "
            "or these procedures are being filtered out. Ensure CPT codes are extracted "
            "from the 'code_information' array (type=='CPT') for every standard_charge_information entry."
        )
        logger.warning(f"[validate] FAIL — missing CPT codes {missing_codes}")
        return False, reason

    # CHECK 4 — price out of sane range for any tracked procedure
    for cpt, spec in expected_procedures.items():
        prices = code_prices.get(cpt, [])
        out_of_range = [p for p in prices if p < spec["min_price"] or p > spec["max_price"]]
        if len(out_of_range) == len(prices) and prices:
            # ALL prices for this CPT are out of range — likely wrong field
            sample = out_of_range[:5]
            reason = (
                f"All {len(prices)} prices for CPT {cpt} ({spec['name']}) are outside "
                f"the expected range ${spec['min_price']:,.0f}–${spec['max_price']:,.0f}. "
                f"Sample values: {sample}. "
                "The extractor may be reading gross charges or a different field instead of "
                "payer-specific negotiated rates (standard_charge_dollar)."
            )
            logger.warning(f"[validate] FAIL — CPT {cpt} all prices out of range")
            return False, reason

    # All checks passed
    logger.info(f"[validate] PASS — {len(rows):,} rows, {len(found_codes)} unique CPT codes")
    return True, ""
