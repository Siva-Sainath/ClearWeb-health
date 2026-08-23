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

            CREATE TABLE IF NOT EXISTS collector_jobs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_name   TEXT NOT NULL,
                slug            TEXT NOT NULL,
                domain          TEXT NOT NULL,
                target_url      TEXT NOT NULL,
                collector_id    TEXT NOT NULL,
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


def insert_collector_job(hospital_name: str, slug: str, domain: str, target_url: str, collector_id: str) -> None:
    """Insert a new pending collector job."""
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO collector_jobs
                (hospital_name, slug, domain, target_url, collector_id, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (hospital_name, slug, domain, target_url, collector_id, "pending"),
        )
        conn.commit()
        logger.info(f"[db] Inserted pending collector_job for {slug} ({collector_id})")
    finally:
        conn.close()


def update_collector_job_status(collector_id: str, status: str, reason: str = "") -> None:
    """Update the status of a collector job."""
    conn = _connect()
    try:
        conn.execute(
            """
            UPDATE collector_jobs
            SET status = ?, reason = ?
            WHERE collector_id = ?
            """,
            (status, reason, collector_id),
        )
        conn.commit()
        logger.info(f"[db] Updated collector_job {collector_id} to status='{status}'")
    finally:
        conn.close()


def get_pending_collector_jobs() -> list[dict]:
    """Return all pending collector jobs."""
    conn = _connect()
    try:
        cursor = conn.execute("SELECT * FROM collector_jobs WHERE status = 'pending' ORDER BY id")
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_failed_collector_jobs(limit: int = 50) -> list[dict]:
    conn = _connect()
    try:
        cursor = conn.execute(
            "SELECT * FROM collector_jobs WHERE status = 'failed' ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def reset_collector_jobs_to_pending(slugs: list[str] | None = None) -> int:
    """Reset failed jobs back to pending for retry. If slugs empty, reset all failed."""
    conn = _connect()
    try:
        if slugs:
            placeholders = ",".join("?" for _ in slugs)
            cur = conn.execute(
                f"UPDATE collector_jobs SET status='pending', reason='' WHERE status='failed' AND slug IN ({placeholders})",
                slugs,
            )
        else:
            cur = conn.execute(
                "UPDATE collector_jobs SET status='pending', reason='' WHERE status='failed'"
            )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def collector_jobs_summary() -> dict:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT status, COUNT(*) as n FROM collector_jobs GROUP BY status"
        ).fetchall()
        by_status = {row[0]: row[1] for row in rows}
        recent = conn.execute(
            """
            SELECT slug, hospital_name, collector_id, status, reason, target_url
            FROM collector_jobs ORDER BY id DESC LIMIT 20
            """
        ).fetchall()
        return {
            "byStatus": by_status,
            "verified": by_status.get("verified", 0),
            "pending": by_status.get("pending", 0),
            "failed": by_status.get("failed", 0),
            "recent": [
                {
                    "slug": r[0],
                    "hospitalName": r[1],
                    "collectorId": r[2],
                    "status": r[3],
                    "reason": r[4],
                    "targetUrl": r[5],
                }
                for r in recent
            ],
        }
    finally:
        conn.close()


def count_verified_collectors() -> int:
    """Return the total number of verified collectors."""
    conn = _connect()
    try:
        row = conn.execute("SELECT COUNT(*) FROM collector_jobs WHERE status = 'verified'").fetchone()
        return row[0]
    finally:
        conn.close()

def collector_job_exists(slug: str) -> bool:
    """Return True if a collector job already exists for this slug."""
    conn = _connect()
    try:
        row = conn.execute("SELECT COUNT(*) FROM collector_jobs WHERE slug = ?", (slug,)).fetchone()
        return row[0] > 0
    finally:
        conn.close()


def get_heal_events(limit: int = 20) -> list[dict]:
    """Return recent heal events for API / trust panel."""
    conn = _connect()
    try:
        cursor = conn.execute(
            """
            SELECT timestamp, collector_id, reason, success, before_sample, after_sample
            FROM heal_events
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        out = []
        for row in cursor.fetchall():
            d = dict(row)
            d["success"] = bool(d.get("success"))
            out.append(d)
        return out
    finally:
        conn.close()

