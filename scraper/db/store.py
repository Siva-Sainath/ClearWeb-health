"""
db/store.py
===========
SQLite persistence layer.

Tables
------
price_records
  Primary key: (hospital_id, procedure_code, payer)
  Upsert on conflict — most recent scrape wins.

heal_events
  Append-only log of heal operations (mirrors heal_log.jsonl for API access).

heal_jobs
  Log of automated heal reviews (preview evaluations), tracking auto-approvals and needs_human rejections.

Usage
-----
  from db.store import init_db, upsert_to_db, get_rows_for_hospital
  init_db()
  upsert_to_db(rows)
  rows = get_rows_for_hospital("hca_houston_medical_center")
"""

import json
import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "chargemaster.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # rows accessible as dicts
    return conn


def init_db() -> None:
    """Create tables if they don't exist. Safe to call on every startup."""
    conn = _connect()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS price_records (
                hospital_id     TEXT NOT NULL,
                procedure_code  TEXT NOT NULL,
                procedure_name  TEXT,
                payer           TEXT NOT NULL,
                price           REAL,
                price_type      TEXT,
                setting         TEXT,
                source_url      TEXT,
                scraped_at      TEXT,
                PRIMARY KEY (hospital_id, procedure_code, payer)
            );

            CREATE TABLE IF NOT EXISTS heal_events (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp       TEXT NOT NULL,
                collector_id    TEXT NOT NULL,
                reason          TEXT,
                success         INTEGER,    -- 0 or 1
                before_sample   TEXT,       -- JSON
                after_sample    TEXT        -- JSON
            );
            
            CREATE TABLE IF NOT EXISTS heal_jobs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id          TEXT,
                collector_id    TEXT NOT NULL,
                hospital_id     TEXT,
                status          TEXT NOT NULL,
                reason          TEXT,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_price_hospital
                ON price_records (hospital_id);

            CREATE INDEX IF NOT EXISTS idx_price_code
                ON price_records (procedure_code);
        """)
        conn.commit()
        logger.info(f"[db] Database initialised at {DB_PATH}")
    finally:
        conn.close()


def upsert_to_db(rows: list[dict]) -> int:
    """
    Insert or replace rows into price_records.
    Key: (hospital_id, procedure_code, payer).
    Returns the number of rows written.
    """
    if not rows:
        logger.warning("[db] upsert_to_db() called with empty rows list — nothing written")
        return 0

    conn = _connect()
    try:
        cursor = conn.cursor()
        cursor.executemany(
            """
            INSERT OR REPLACE INTO price_records
                (hospital_id, procedure_code, procedure_name, payer,
                 price, price_type, setting, source_url, scraped_at)
            VALUES
                (:hospital_id, :procedure_code, :procedure_name, :payer,
                 :price, :price_type, :setting, :source_url, :scraped_at)
            """,
            rows,
        )
        conn.commit()
        count = cursor.rowcount
        logger.info(f"[db] Upserted {count:,} rows for hospital '{rows[0]['hospital_id']}'")
        return count
    finally:
        conn.close()


def get_rows_for_hospital(hospital_id: str) -> list[dict]:
    """Return all price_records rows for a given hospital as a list of dicts."""
    conn = _connect()
    try:
        cursor = conn.execute(
            """
            SELECT hospital_id, procedure_code, procedure_name, payer,
                   price, price_type, setting, source_url, scraped_at
            FROM price_records
            WHERE hospital_id = ?
            ORDER BY procedure_code, payer
            """,
            (hospital_id,),
        )
        rows = [dict(row) for row in cursor.fetchall()]
        logger.debug(f"[db] get_rows_for_hospital({hospital_id!r}) → {len(rows)} rows")
        return rows
    finally:
        conn.close()


def get_row_count(hospital_id: str | None = None) -> int:
    """Return total row count, optionally filtered by hospital_id."""
    conn = _connect()
    try:
        if hospital_id:
            row = conn.execute(
                "SELECT COUNT(*) FROM price_records WHERE hospital_id = ?",
                (hospital_id,),
            ).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) FROM price_records").fetchone()
        return row[0]
    finally:
        conn.close()


def insert_heal_event(
    timestamp: str,
    collector_id: str,
    reason: str,
    success: bool,
    before_sample: list[dict],
    after_sample: list[dict],
) -> None:
    """Persist a heal event record to the heal_events table."""
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO heal_events
                (timestamp, collector_id, reason, success, before_sample, after_sample)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp,
                collector_id,
                reason,
                1 if success else 0,
                json.dumps(before_sample[:10]),
                json.dumps(after_sample[:10]),
            ),
        )
        conn.commit()
    finally:
        conn.close()

def insert_heal_job(
    job_id: str | None,
    collector_id: str,
    hospital_id: str | None,
    status: str,
    reason: str,
) -> None:
    """Persist a heal job status check to the heal_jobs table."""
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO heal_jobs
                (job_id, collector_id, hospital_id, status, reason)
            VALUES (?, ?, ?, ?, ?)
            """,
            (job_id, collector_id, hospital_id, status, reason),
        )
        conn.commit()
        logger.info(f"[db] Logged heal_job: collector={collector_id}, status={status}, reason={reason}")
    finally:
        conn.close()
