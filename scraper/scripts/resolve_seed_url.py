#!/usr/bin/env python3
"""Resolve best Bright Data seed URL: cms-hpt.txt > source-page-url > validated landing page."""

from __future__ import annotations

import re
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlparse

_USER_AGENT = "ClearwebHealth/1.0 (CMS price transparency)"
_TIMEOUT = 15

# BD AI generation repeatedly fails on these slugs (bad DOM or rate limits).
SKIP_SLUGS: set[str] = {
    "memorial_hermann_tmc",
    "hca_houston_medical",
    "stlukes_baylor_houston",
    "chi_st_lukes_patients",
    "chi_st_lukes_vintage",
    "houston_methodist_main",  # half-built error collector in BD; use re-create later
}


@dataclass
class SeedResolution:
    slug: str
    seed_url: str
    source: str  # cms_hpt | source_page | landing | invalid
    ok: bool
    detail: str = ""


def _fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = resp.read(8000).decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read(4000).decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return exc.code, body
    except Exception as exc:
        return 0, str(exc)


def _parse_cms_hpt(body: str) -> tuple[str | None, str | None]:
    if body.lstrip().startswith("<"):
        return None, None
    mrf = re.search(r"^mrf-url:\s*(\S+)", body, re.MULTILINE | re.IGNORECASE)
    src = re.search(r"^source-page-url:\s*(\S+)", body, re.MULTILINE | re.IGNORECASE)
    return (
        mrf.group(1).strip() if mrf else None,
        src.group(1).strip() if src else None,
    )


def resolve_seed(slug: str, domain: str, landing_url: str) -> SeedResolution:
    domain = domain.replace("https://", "").replace("http://", "").strip("/")
    hosts = [domain]
    if not domain.startswith("www."):
        hosts.append(f"www.{domain}")

    for host in hosts:
        cms_url = f"https://{host}/cms-hpt.txt"
        status, body = _fetch(cms_url)
        if status == 200:
            mrf, source_page = _parse_cms_hpt(body)
            if mrf:
                return SeedResolution(slug, cms_url, "cms_hpt", True, f"mrf-url present ({mrf[:60]}…)")
            if source_page:
                st, _ = _fetch(source_page)
                if st and st < 400:
                    return SeedResolution(slug, source_page, "source_page", True, "from cms-hpt source-page-url")
            return SeedResolution(slug, cms_url, "cms_hpt", True, "cms-hpt.txt (parse mrf-url lines)")

    st, _ = _fetch(landing_url)
    if st and st < 400:
        return SeedResolution(slug, landing_url, "landing", True, f"HTTP {st}")

    return SeedResolution(
        slug,
        landing_url,
        "invalid",
        False,
        f"cms-hpt failed for {hosts}; landing HTTP {st}",
    )


def resolve_candidate(candidate: dict) -> SeedResolution:
    slug = candidate.get("slug", "")
    if slug in SKIP_SLUGS:
        return SeedResolution(slug, candidate.get("url", ""), "invalid", False, "skip list (known bad)")
    return resolve_seed(slug, candidate.get("domain", ""), candidate.get("url", ""))
