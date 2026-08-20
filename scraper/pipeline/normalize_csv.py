"""
pipeline/normalize_csv.py — CMS tall CSV MRF parser (BSW, Ascension, etc.)
"""

from __future__ import annotations

import csv
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def _row_cpt(row: dict) -> str:
    """Extract CPT code from CMS tall CSV code|N / code|N|type columns."""
    for i in range(1, 5):
        code = (row.get(f"code|{i}") or "").strip()
        ctype = (row.get(f"code|{i}|type") or "").strip().upper()
        if code and ctype == "CPT":
            return code
    # Fallback: any code field that looks like a 5-digit CPT
    for i in range(1, 5):
        code = (row.get(f"code|{i}") or "").strip()
        if code.isdigit() and len(code) == 5:
            return code
    return ""


def normalize_csv_file(
    raw_path: Path,
    hospital_id: str,
    source_url: str = "",
    filter_codes: frozenset[str] | None = None,
    *,
    max_rows: int | None = None,
) -> list[dict]:
    """Parse CMS tall CSV into shared charge row schema."""
    scraped_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    codes_seen: set[str] = set()
    code_needles = tuple(filter_codes) if filter_codes else ()

    with open(raw_path, newline="", encoding="utf-8-sig", errors="replace") as fh:
        reader_raw = csv.reader(fh)
        header: list[str] | None = None
        for row in reader_raw:
            if row and row[0] == "description":
                header = row
                break
        if not header:
            logger.warning("[normalize_csv] No CMS header row found in %s", raw_path.name)
            return []

        for i, row in enumerate(reader_raw):
            if max_rows and i >= max_rows:
                break
            if len(row) < len(header):
                row = row + [""] * (len(header) - len(row))
            elif len(row) > len(header):
                row = row[: len(header)]

            if code_needles and not any(c in row for c in code_needles):
                continue

            row_dict = dict(zip(header, row))
            procedure_code = _row_cpt(row_dict)
            if filter_codes is not None and procedure_code not in filter_codes:
                continue

            price_raw = (
                row_dict.get("standard_charge|negotiated_dollar")
                or row_dict.get("standard_charge|discounted_cash")
                or row_dict.get("standard_charge|gross")
                or ""
            )
            try:
                price = float(str(price_raw).replace(",", "").strip() or "0")
            except ValueError:
                continue
            if price <= 0:
                continue

            codes_seen.add(procedure_code)
            payer_name = (row_dict.get("payer_name") or "").strip()
            plan_name = (row_dict.get("plan_name") or "").strip()
            payer = f"{payer_name} / {plan_name}".strip(" /") if (payer_name or plan_name) else "Cash"

            rows.append({
                "procedure_code": procedure_code,
                "procedure_name": (row_dict.get("description") or "").strip(),
                "hospital_id": hospital_id,
                "payer": payer,
                "payer_name": payer_name,
                "plan_name": plan_name,
                "price": price,
                "price_type": "negotiated",
                "setting": (row_dict.get("setting") or "unknown").strip(),
                "source_url": source_url,
                "scraped_at": scraped_at,
            })

            if filter_codes and codes_seen >= filter_codes and len(rows) >= 5:
                break

    logger.info("[normalize_csv] %s → %d rows", raw_path.name, len(rows))
    return rows
