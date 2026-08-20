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


def studio_context_for_system(system: str) -> str:
    """Return studio JS template text for a health system (hca, ascension, bsw)."""
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


def enrich_heal_prompt(hospital: dict, reason: str, tier: int = 0) -> str:
    """
    Build a heal prompt with studio template context and tier-specific escalation.
    tier 0: validation reason only
    tier 1: studio template + broken function hints
    tier 2: unlocker/seed fallback instructions
    tier 3: recreate collector from scratch
    """
    name = hospital.get("name", hospital.get("id", "hospital"))
    system = hospital.get("system", "")
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
    """Append studio template to collector create prompts."""
    system = hospital.get("system", "")
    studio = studio_context_for_system(system)
    if not studio:
        return prompt
    return f"{prompt.strip()}\n\n{studio}"
