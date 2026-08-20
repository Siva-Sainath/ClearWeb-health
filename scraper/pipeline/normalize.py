"""
pipeline/normalize.py
=====================
Step 3 — Map HCA Houston's CMS-compliant JSON into the shared schema.

CONFIRMED JSON SHAPE (plain-text read, 2026-08-19):
----------------------------------------------------
Top-level object keys:
  hospital_name, last_updated_on, version, standard_charge_information

standard_charge_information  →  array of entries, each:
  {
    "description":    "<str>",
    "code_information": [
      {"code": "<str>", "type": "RC|CPT|MS-DRG|..."}
    ],
    "standard_charges": [
      {
        "setting":  "outpatient|inpatient",
        "minimum":  <float>,
        "maximum":  <float>,
        "payers_information": [
          {
            "payer_name":             "<str>",
            "plan_name":              "<str>",
            "standard_charge_dollar": <float>,
            "methodology":            "<str>"
          }
        ]
      }
    ]
  }

No gross / discounted_cash / cash_price fields exist in this file.
price_type for all rows = "negotiated"
price = payers_information[n].standard_charge_dollar

Output schema per row:
  {
    procedure_code: str,   # CPT preferred; first code if no CPT
    procedure_name: str,
    hospital_id:   str,
    payer:         str,    # "<payer_name> / <plan_name>"
    price:         float,
    price_type:    str,    # always "negotiated" for this file
    setting:       str,    # "inpatient" | "outpatient"
    source_url:    str,
    scraped_at:    str,    # ISO-8601 UTC timestamp
  }

STREAMING STRATEGY:
  ijson.items() is used so the 606 MB file is never fully loaded into RAM.
  Only rows whose procedure_code is in TRACKED_CODES are kept; everything
  else is yielded by ijson and immediately discarded.
  Pass filter_codes=None to keep all rows (useful for future hospitals).
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

import ijson

from pipeline.ingest import maybe_extract_zip
from pipeline.normalize_csv import normalize_csv_file
from pipeline.validate import EXPECTED_PROCEDURES

logger = logging.getLogger(__name__)

TRACKED_CODES: frozenset[str] = frozenset(EXPECTED_PROCEDURES.keys())


def extract_mrf_metadata(raw_path: Path, format_hint: str = "json") -> dict:
    """Read hospital name/address from MRF header — real data from published files."""
    path = maybe_extract_zip(raw_path)
    meta: dict = {}

    if format_hint == "csv" or path.suffix.lower() == ".csv":
        try:
            import csv

            with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
                reader = csv.reader(fh)
                for row in reader:
                    if len(row) >= 2 and row[0] in ("hospital_name", "last_updated_on", "hospital_address"):
                        meta[row[0]] = row[1]
                    if row and row[0] == "description":
                        break
        except OSError:
            pass
        return meta

    try:
        with open(path, "rb") as fh:
            for key in ("hospital_name", "last_updated_on", "version"):
                try:
                    val = next(ijson.items(fh, key))
                    if val:
                        meta[key] = val
                    fh.seek(0)
                except (StopIteration, ijson.common.IncompleteJSONError):
                    fh.seek(0)
            try:
                addresses = next(ijson.items(fh, "hospital_address"))
                if isinstance(addresses, list) and addresses:
                    meta["hospital_address"] = addresses[0]
                elif isinstance(addresses, str):
                    meta["hospital_address"] = addresses
            except (StopIteration, ijson.common.IncompleteJSONError):
                pass
    except Exception as exc:
        logger.debug("[normalize] metadata extract failed for %s: %s", path.name, exc)

    return meta


def normalize_file(
    raw_path: Path,
    hospital_id: str,
    format_hint: str,
    source_url: str = "",
    filter_codes: frozenset[str] | None = TRACKED_CODES,
    allow_partial: bool = False,
) -> list[dict]:
    """
    Stream-parse the MRF JSON at raw_path and return a flat list of charge rows.

    Parameters
    ----------
    raw_path     : Path to the downloaded MRF file.
    hospital_id  : Hospital identifier (written into every row).
    format_hint  : "json" expected; warns if different.
    source_url   : Written into every row for traceability.
    filter_codes : Only rows whose procedure_code is in this set are kept.
                   Pass None to keep every row (future hospitals / full export).

    Returns
    -------
    list[dict]   : Flat list of charge rows, one per payer-line.
    """
    if format_hint == "csv":
        return normalize_csv_file(
            maybe_extract_zip(raw_path),
            hospital_id=hospital_id,
            source_url=source_url,
            filter_codes=filter_codes,
        )

    if format_hint not in ("json", ""):
        logger.warning(
            f"[normalize] format_hint={format_hint!r} — expected 'json' or 'csv', proceeding as JSON"
        )

    scraped_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    total_entries = 0
    total_payer_lines = 0
    skipped_no_price = 0
    filtered_out = 0
    codes_seen: set[str] = set()

    logger.info(f"[normalize] Streaming {raw_path.name} …")
    if filter_codes is not None:
        logger.info(f"[normalize] Tracking only CPT codes: {sorted(filter_codes)}")

    with open(raw_path, "rb") as fh:
        # ijson.items yields one fully-assembled dict per standard_charge_information entry
        items = ijson.items(fh, "standard_charge_information.item")

        try:
            for entry in items:
                total_entries += 1
                description: str = entry.get("description", "").strip()
                code_info: list = entry.get("code_information", [])

                procedure_code = _pick_code(code_info)

                # Filter: skip entries whose code is not in our tracked set
                if filter_codes is not None and procedure_code not in filter_codes:
                    filtered_out += 1
                    continue

                codes_seen.add(procedure_code)

                for charge in entry.get("standard_charges", []):
                    setting: str = charge.get("setting", "unknown")

                    for payer_info in charge.get("payers_information", []):
                        total_payer_lines += 1
                        price = payer_info.get("standard_charge_dollar")

                        if price is None or price == 0:
                            skipped_no_price += 1
                            continue

                        payer_name = payer_info.get("payer_name", "")
                        plan_name = payer_info.get("plan_name", "")

                        # Standardize insurance + plan
                        payer_name = payer_name.strip()
                        plan_name = plan_name.strip()
                        payer = f"{payer_name} / {plan_name}".strip(" /") if (payer_name or plan_name) else "Cash"

                        rows.append({
                            "procedure_code": procedure_code,
                            "procedure_name": description,
                            "hospital_id": hospital_id,
                            "payer": payer,
                            "payer_name": payer_name,
                            "plan_name": plan_name,
                            "price": float(price),
                            "price_type": "negotiated",
                            "setting": setting,
                            "source_url": source_url,
                            "scraped_at": scraped_at,
                        })

                # Early exit once every tracked CPT has at least one row
                if filter_codes is not None and codes_seen >= filter_codes and rows:
                    logger.info("[normalize] Early exit — all tracked CPT codes found")
                    break

        except Exception as exc:
            if allow_partial and rows:
                logger.info(f"[normalize] Partial file reached EOF — kept {len(rows)} rows")
            else:
                raise

    logger.info(
        f"[normalize] Done. "
        f"Entries streamed: {total_entries:,} | "
        f"Filtered out (not tracked): {filtered_out:,} | "
        f"Payer lines seen on tracked entries: {total_payer_lines:,} | "
        f"Rows kept (non-zero price): {len(rows):,} | "
        f"Skipped (zero/null price): {skipped_no_price}"
    )
    return rows


def _pick_code(code_info: list) -> str:
    """
    From code_information list, return the best code string.
    Priority: CPT > RC > first available > empty string.

    Confirmed field names from live file:
      code_information[n].code  — the code string
      code_information[n].type  — "CPT", "RC", "MS-DRG", "APR-DRG", "ICD", etc.
    """
    cpt = next(
        (c["code"] for c in code_info if str(c.get("type", "")).upper() == "CPT"), None
    )
    if cpt:
        return str(cpt)
    rc = next(
        (c["code"] for c in code_info if str(c.get("type", "")).upper() == "RC"), None
    )
    if rc:
        return str(rc)
    if code_info:
        return str(code_info[0].get("code", ""))
    return ""
