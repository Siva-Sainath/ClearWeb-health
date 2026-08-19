"""
api/main.py
===========
FastAPI application — serves stored charge data from SQLite.

Endpoints
---------
GET /health
    → {"status": "ok", "db_rows": <total_count>}

GET /hospitals/{hospital_id}/prices
    → list of price_records for the given hospital

GET /hospitals/{hospital_id}/prices?procedure_code=70553
    → filtered by CPT code

GET /hospitals/{hospital_id}/prices?payer=BCBS
    → filtered by payer name (partial, case-insensitive)

Run with:
    uvicorn api.main:app --reload
"""

import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from db.store import get_row_count, get_rows_for_hospital, init_db

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Chargemaster Radar API",
    description=(
        "Hospital price transparency data — normalised from CMS machine-readable files. "
        "Hackathon build: Into the Scrape-Verse (Aug 2026)."
    ),
    version="0.1.0",
)

# Allow any origin for hackathon — tighten if this goes to production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Ensure DB tables exist when the API starts."""
    init_db()
    logger.info("[api] Database ready.")


@app.get("/health")
def health_check():
    """Liveness check — also reports total DB row count."""
    total = get_row_count()
    return {"status": "ok", "db_rows": total}


@app.get("/hospitals/{hospital_id}/prices")
def get_hospital_prices(
    hospital_id: str,
    procedure_code: Optional[str] = Query(
        default=None,
        description="Filter by exact CPT/procedure code (e.g. 70553)",
    ),
    payer: Optional[str] = Query(
        default=None,
        description="Filter by payer name — partial, case-insensitive match",
    ),
    limit: int = Query(
        default=500,
        ge=1,
        le=10_000,
        description="Max rows to return (default 500, max 10000)",
    ),
):
    """
    Return stored price records for a hospital.

    Example:
        GET /hospitals/hca_houston_medical_center/prices
        GET /hospitals/hca_houston_medical_center/prices?procedure_code=70553
        GET /hospitals/hca_houston_medical_center/prices?payer=BCBS&limit=50
    """
    rows = get_rows_for_hospital(hospital_id)

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No price records found for hospital_id='{hospital_id}'. "
                   "Run the pipeline first: python run_pipeline.py",
        )

    # Optional filters
    if procedure_code:
        rows = [r for r in rows if r["procedure_code"] == procedure_code]
    if payer:
        payer_lower = payer.lower()
        rows = [r for r in rows if payer_lower in (r.get("payer") or "").lower()]

    # Respect limit
    rows = rows[:limit]

    return {
        "hospital_id": hospital_id,
        "count": len(rows),
        "rows": rows,
    }


@app.get("/hospitals/{hospital_id}/summary")
def get_hospital_summary(hospital_id: str):
    """
    Return a per-CPT price summary (min/max/avg across all payers) for a hospital.
    Useful for quick sanity-checking after a pipeline run.
    """
    rows = get_rows_for_hospital(hospital_id)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for '{hospital_id}'")

    from collections import defaultdict

    by_code: dict[str, list] = defaultdict(list)
    names: dict[str, str] = {}
    for r in rows:
        code = r["procedure_code"]
        by_code[code].append(r["price"])
        names[code] = r.get("procedure_name", "")

    summary = []
    for code, prices in sorted(by_code.items()):
        valid = [p for p in prices if p and p > 0]
        summary.append({
            "procedure_code": code,
            "procedure_name": names[code],
            "payer_count": len(prices),
            "min_price": min(valid) if valid else None,
            "max_price": max(valid) if valid else None,
            "avg_price": round(sum(valid) / len(valid), 2) if valid else None,
        })

    return {"hospital_id": hospital_id, "procedures": summary}
