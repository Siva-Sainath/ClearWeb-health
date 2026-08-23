"""Inject Scraper Studio interaction templates into create/heal prompts."""

from __future__ import annotations

from pathlib import Path

STUDIO_DIR = Path(__file__).parent

SYSTEM_TEMPLATES: dict[str, str] = {
    "hca": "hca_portal.js",
    "ascension": "ascension_portal.js",
    "bsw": "bsw_portal.js",
}


def _read_template(filename: str) -> str:
    path = STUDIO_DIR / filename
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


CREATE_STUDIO_HINTS: dict[str, str] = {
    "hca": (
        "HCA health system: navigate Price Transparency CMS file listing; "
        "return pricing_files[].file_url for the matching facility (JSON/CSV direct download)."
    ),
    "ascension": (
        "Ascension portal: open healthcare.ascension.org price transparency; "
        "return standard_charges_files or mrf_url direct download link."
    ),
    "bsw": (
        "Baylor Scott & White: use estimate/cost-of-care or transparency page; "
        "return direct MRF JSON/CSV URL, not an HTML portal page."
    ),
}

BD_MAX_CREATE_PROMPT_LEN = 990


def studio_context_for_system(system: str, *, for_create: bool = False) -> str:
    """Studio guidance — short hints for create (BD 1000 char cap), full JS for heal."""
    if for_create:
        return CREATE_STUDIO_HINTS.get(system or "", "")

    filename = SYSTEM_TEMPLATES.get(system or "")
    if not filename:
        return ""
    body = _read_template(filename)
    if not body:
        return ""
    return (
        "Use Browser worker. Reference these Scraper Studio interaction functions:\n"
        f"{body}\n"
        "Return direct CMS machine-readable file URL (.json or .csv), not a portal page URL."
    )


def infer_system(domain: str = "", slug: str = "", url: str = "") -> str:
    """Map hospital domain/slug to a Scraper Studio interaction template."""
    d = (domain or "").lower()
    u = (url or "").lower()
    s = (slug or "").lower()
    if any(x in d or x in u for x in ("bswhealth",)):
        return "bsw"
    if any(x in d or x in u for x in ("ascension.org", "healthcare.ascension")):
        return "ascension"
    if any(
        x in d or x in s or x in u
        for x in ("hca", "medicalcityhealth", "hcahouston", "st davids", "stdavids")
    ):
        return "hca"
    return ""


def enrich_heal_prompt(hospital: dict, reason: str, tier: int = 0) -> str:
    """
    Build a heal prompt with studio template context and tier-specific escalation.
    tier 0: validation reason only
    tier 1: studio template + broken function hints
    tier 2: unlocker/seed fallback instructions
    tier 3: recreate collector from scratch
    """
    name = hospital.get("name", hospital.get("id", "hospital"))
    system = hospital.get("system") or infer_system(
        hospital.get("domain", ""),
        hospital.get("slug", hospital.get("id", "")),
        hospital.get("price_transparency_page", hospital.get("url", "")),
    )
    studio = studio_context_for_system(system)

    base = f"The collector for {name} failed. {reason[:400]}."

    if tier >= 3:
        seed = hospital.get("mrf_seed_url") or hospital.get("price_transparency_page") or hospital.get("homepage", "")
        return (
            f"{base} Create fresh navigation logic. Seed URL: {seed}. "
            f"Facility: {name}. {studio}"
        ).strip()

    if tier >= 2:
        seed = hospital.get("mrf_seed_url") or ""
        cms = hospital.get("cms_hpt_url") or ""
        return (
            f"{base} If portal navigation fails, parse cms-hpt.txt or use verified seed: {seed or cms}. "
            f"{studio}"
        ).strip()

    if tier >= 1 and studio:
        return f"{base} {studio}"

    return base.strip()


def enrich_create_prompt(hospital: dict, prompt: str) -> str:
    """Append studio hint to collector create prompts (must stay under BD 1000 char limit)."""
    system = hospital.get("system") or infer_system(
        hospital.get("domain", ""),
        hospital.get("slug", hospital.get("id", "")),
        hospital.get("url", ""),
    )
    hint = studio_context_for_system(system, for_create=True)
    if not hint:
        return prompt.strip()[:BD_MAX_CREATE_PROMPT_LEN]
    combined = f"{prompt.strip()}\n\n{hint}"
    return combined[:BD_MAX_CREATE_PROMPT_LEN]
