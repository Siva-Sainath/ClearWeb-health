"""
pipeline/ingest.py
==================
Step 2 — Download MRF files via Bright Data Web Unlocker API.

Bright Data product map (hackathon):
  • Scraper Studio  → portal navigation / mrf_url discovery (discover.py)
  • Web Unlocker    → all MRF file bytes (this module)
  • Self-Healing    → collector repair on failure (heal.py)
"""

import hashlib
import logging
import os
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests
from collectors.unlocker import fetch_bytes, require_unlocker, use_unlocker_for_download

logger = logging.getLogger(__name__)

RAW_DIR = Path(__file__).parent.parent / "data" / "raw"
CHUNK_SIZE = 8 * 1024 * 1024


@dataclass(frozen=True)
class DownloadResult:
    """MRF download outcome — path plus provenance for demo UI transparency."""

    path: Path
    cached: bool
    source: str  # "disk_cache" | "web_unlocker" | "direct_http"


def _cache_hit(path: Path) -> DownloadResult:
    return DownloadResult(path=path, cached=True, source="disk_cache")


def _is_public_mrf_api(url: str) -> bool:
    """Craneware CMS API endpoints — public, no bot wall; Unlocker returns empty."""
    return "apim.services.craneware.com" in url.lower()


def _cache_is_valid(path: Path, sample_mb: int | None) -> bool:
    size = path.stat().st_size
    if size <= 1024:
        return False
    with open(path, "rb") as fh:
        magic = fh.read(4)
    if magic == b"PK\x03\x04":
        return _is_valid_zip(path)
    if sample_mb and path.suffix.lower() == ".json":
        min_bytes = int(sample_mb * 0.9 * 1024 * 1024)
        if size < min_bytes:
            return False
    return True


def _is_valid_zip(path: Path) -> bool:
    if path.stat().st_size < 1024:
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            return any(n.lower().endswith(".csv") for n in zf.namelist())
    except zipfile.BadZipFile:
        return False


def maybe_extract_zip(path: Path) -> Path:
    """Ascension MRF URLs serve a ZIP containing the CSV. Return the inner CSV path."""
    with open(path, "rb") as fh:
        magic = fh.read(4)
    if magic != b"PK\x03\x04":
        return path

    if not _is_valid_zip(path):
        raise RuntimeError(f"Corrupt or partial ZIP at {path.name} — delete cache and re-download")

    extract_dir = path.parent / f"{path.stem}_unzipped"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(path, "r") as zf:
        csv_members = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        if not csv_members:
            raise RuntimeError(f"ZIP at {path.name} contains no CSV member")
        member = csv_members[0]
        dest = extract_dir / Path(member).name
        if not dest.exists() or dest.stat().st_size == 0:
            zf.extract(member, extract_dir)
            extracted = extract_dir / member
            if extracted != dest and extracted.exists():
                extracted.rename(dest)
        logger.info("[ingest] Extracted %s from %s", dest.name, path.name)
        return dest


def _truncate_sample(path: Path, sample_mb: int | None) -> None:
    """Keep first N MB for large HCA JSON demos (post-Unlocker download)."""
    if not sample_mb or path.suffix.lower() == ".csv":
        return
    limit = sample_mb * 1024 * 1024
    size = path.stat().st_size
    if size > limit:
        path.write_bytes(path.read_bytes()[:limit])
        logger.info("[ingest] Truncated %s to %d MB sample", path.name, sample_mb)


def has_valid_disk_cache(
    url: str,
    hospital_id: str = "",
    *,
    sample_mb: int | None = None,
) -> bool:
    """Return True if a valid on-disk MRF cache exists for this URL (skip BD collector runs)."""
    if os.environ.get("FORCE_REFRESH", "").strip() in ("1", "true", "True"):
        return False
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    url_hash = hashlib.sha256(url.encode()).hexdigest()[:16]
    cached = sorted(RAW_DIR.glob(f"cache_{url_hash}_*"), reverse=True)
    if hospital_id:
        scoped = [p for p in cached if f"_{hospital_id}_" in p.name]
        if scoped:
            cached = scoped + [p for p in cached if p not in scoped]
    for path in cached:
        if _cache_is_valid(path, sample_mb):
            return True
    return False


def download_file(
    url: str,
    hospital_id: str,
    *,
    sample_mb: int | None = None,
    system: str = "",
    force_unlocker: bool = False,
    no_unlocker: bool = False,
) -> DownloadResult:
    """Download MRF via Bright Data Web Unlocker with cache, ZIP extraction, and retries."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    url_hash = hashlib.sha256(url.encode()).hexdigest()[:16]
    if os.environ.get("FORCE_REFRESH", "").strip() not in ("1", "true", "True"):
        cached = sorted(RAW_DIR.glob(f"cache_{url_hash}_*"), reverse=True)
        for path in cached:
            if not _cache_is_valid(path, sample_mb):
                logger.warning("[ingest] Removing invalid cache %s", path.name)
                path.unlink(missing_ok=True)
                continue
            try:
                logger.info("[ingest] Cache hit for %s → %s", hospital_id, path.name)
                return _cache_hit(maybe_extract_zip(path))
            except (RuntimeError, zipfile.BadZipFile) as exc:
                logger.warning("[ingest] Ignoring bad cache %s: %s", path.name, exc)
                path.unlink(missing_ok=True)

    skip_unlocker = no_unlocker or str(os.environ.get("SKIP_UNLOCKER", "")).lower() in ("1", "true")

    if _is_public_mrf_api(url) and not skip_unlocker:
        # Public APIs go direct; if skip_unlocker is true, it goes direct below anyway
        return _download_direct(url, hospital_id, url_hash, sample_mb=sample_mb)

    if not skip_unlocker and not use_unlocker_for_download(force=force_unlocker):
        require_unlocker()

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            if skip_unlocker:
                return _download_direct(url, hospital_id, url_hash, sample_mb=sample_mb)
            else:
                return _download_via_unlocker(url, hospital_id, url_hash, sample_mb=sample_mb)
        except Exception as exc:
            last_err = exc
            logger.warning("[ingest] Download attempt %d failed for %s: %s", attempt, hospital_id, exc)
            time.sleep(attempt * 2)
    raise RuntimeError(f"Download failed for {hospital_id} after 3 attempts: {last_err}")


def _download_direct(
    url: str,
    hospital_id: str,
    url_hash: str,
    *,
    sample_mb: int | None,
) -> DownloadResult:
    """Stream download for public MRF APIs (e.g. Craneware) where Unlocker cannot proxy."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = ".csv" if _is_public_mrf_api(url) else _guess_suffix(url)
    dest = RAW_DIR / f"cache_{url_hash}_{hospital_id}_{ts}{suffix}"

    logger.info("[ingest] Direct stream download → %s for %s", dest.name, hospital_id)
    limit = (sample_mb * 1024 * 1024) if sample_mb else None
    hasher = hashlib.md5()
    bytes_written = 0

    with requests.get(
        url,
        stream=True,
        timeout=600,
        headers={"User-Agent": "ClearwebHealth/1.0 (CMS price transparency)"},
    ) as resp:
        resp.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=CHUNK_SIZE):
                if not chunk:
                    continue
                if limit and bytes_written >= limit:
                    break
                if limit and bytes_written + len(chunk) > limit:
                    chunk = chunk[: limit - bytes_written]
                fh.write(chunk)
                hasher.update(chunk)
                bytes_written += len(chunk)

    if bytes_written < 1024:
        raise RuntimeError(f"Direct download returned only {bytes_written} bytes for {hospital_id}")

    logger.info(
        "[ingest] Direct done. %s bytes, MD5=%s → %s",
        f"{bytes_written:,}",
        hasher.hexdigest(),
        dest.name,
    )
    return DownloadResult(path=maybe_extract_zip(dest), cached=False, source="direct_http")


def _download_via_unlocker(
    url: str,
    hospital_id: str,
    url_hash: str,
    *,
    sample_mb: int | None,
) -> DownloadResult:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = _guess_suffix(url)
    dest = RAW_DIR / f"cache_{url_hash}_{hospital_id}_{ts}{suffix}"

    logger.info("[ingest] Bright Data Web Unlocker → %s for %s", dest.name, hospital_id)
    data = fetch_bytes(url)
    if len(data) < 1024:
        raise RuntimeError(f"Web Unlocker returned only {len(data)} bytes for {hospital_id}")

    hasher = hashlib.md5()
    hasher.update(data)
    dest.write_bytes(data)
    _truncate_sample(dest, sample_mb)
    logger.info(
        "[ingest] Unlocker done. %s bytes, MD5=%s → %s",
        f"{dest.stat().st_size:,}",
        hasher.hexdigest(),
        dest.name,
    )
    return DownloadResult(path=maybe_extract_zip(dest), cached=False, source="web_unlocker")


def _guess_suffix(url: str) -> str:
    path = url.split("?")[0]
    name = path.rsplit("/", 1)[-1]
    if name.lower() in ("mrf", "charges"):
        return ".csv"
    if "." in name:
        return "." + name.rsplit(".", 1)[-1].lower()
    return ".json"
