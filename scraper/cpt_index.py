"""
cpt_index.py — Common procedures + CPT codes for matching onboarding conditions.
"""

from __future__ import annotations

# Common outpatient procedures mapped to likely natural-language conditions
PROCEDURE_INDEX: dict[str, dict] = {
    "mri brain": {"cpt": ["70553", "70551", "70552"], "category": "radiology"},
    "brain mri": {"cpt": ["70553", "70551", "70552"], "category": "radiology"},
    "mri of the brain": {"cpt": ["70553", "70551", "70552"], "category": "radiology"},
    "head mri": {"cpt": ["70553", "70551", "70552"], "category": "radiology"},
    "mri": {"cpt": ["70553", "70551", "70552"], "category": "radiology"},
    "er visit": {"cpt": ["99281", "99282", "99283", "99284", "99285"], "category": "emergency"},
    "emergency room visit": {"cpt": ["99281", "99282", "99283", "99284", "99285"], "category": "emergency"},
    "emergency room": {"cpt": ["99281", "99282", "99283", "99284", "99285"], "category": "emergency"},
    "mri lumbar": {"cpt": ["72148", "72158", "72149"], "category": "radiology"},
    "lumbar mri": {"cpt": ["72148", "72158", "72149"], "category": "radiology"},
    "mri knee": {"cpt": ["73721", "73722", "73723"], "category": "radiology"},
    "knee mri": {"cpt": ["73721", "73722", "73723"], "category": "radiology"},
    "mri shoulder": {"cpt": ["73221", "73222", "73223"], "category": "radiology"},
    "shoulder mri": {"cpt": ["73221", "73222", "73223"], "category": "radiology"},
    "colonoscopy": {"cpt": ["45378", "45385", "45380"], "category": "gastroenterology"},
    "screening colonoscopy": {"cpt": ["45378", "45385", "45380"], "category": "gastroenterology"},
    "appendectomy": {"cpt": ["44950", "44960", "44970"], "category": "surgery"},
    "knee replacement": {"cpt": ["27447"], "category": "orthopedic"},
    "total knee": {"cpt": ["27447"], "category": "orthopedic"},
    "hip replacement": {"cpt": ["27130"], "category": "orthopedic"},
    "total hip": {"cpt": ["27130"], "category": "orthopedic"},
    "er visit": {"cpt": ["99281", "99282", "99283", "99284", "99285"], "category": "emergency"},
    "emergency": {"cpt": ["99281", "99282", "99283", "99284", "99285"], "category": "emergency"},
    "childbirth": {"cpt": ["59400", "59510", "59610"], "category": "obstetrics"},
    "delivery": {"cpt": ["59400", "59510", "59610"], "category": "obstetrics"},
    "c-section": {"cpt": ["59510", "59610"], "category": "obstetrics"},
    "vaginal delivery": {"cpt": ["59400", "59610"], "category": "obstetrics"},
    "gallbladder": {"cpt": ["47562", "47563"], "category": "surgery"},
    "hernia": {"cpt": ["49505", "49507", "49520"], "category": "surgery"},
    "cataract": {"cpt": ["66982", "66984"], "category": "ophthalmology"},
    "endoscopy": {"cpt": ["43235", "43239"], "category": "gastroenterology"},
    "upper endoscopy": {"cpt": ["43235", "43239"], "category": "gastroenterology"},
    "egd": {"cpt": ["43235", "43239"], "category": "gastroenterology"},
    "biopsy": {"cpt": ["11100", "11101"], "category": "pathology"},
    "mammogram": {"cpt": ["77065", "77066", "77067"], "category": "radiology"},
    "x-ray": {"cpt": ["73060", "73510"], "category": "radiology"},
    "ct scan": {"cpt": ["74150", "74160", "74170"], "category": "radiology"},
    "physical therapy": {"cpt": ["97110", "97112", "97140"], "category": "therapy"},
    "blood test": {"cpt": ["80053", "80076"], "category": "lab"},
    "sleep study": {"cpt": ["95810", "95811"], "category": "sleep"},
    "tonsillectomy": {"cpt": ["42820", "42821"], "category": "ent"},
    "vasectomy": {"cpt": ["55250"], "category": "urology"},
    "tubal ligation": {"cpt": ["58670", "58671"], "category": "gynecology"},
}


# Insurance carrier → common display/negotiated names in MRF files
INSURANCE_ALIASES: dict[str, list[str]] = {
    "aetna": ["aetna", "aetna better health", "aetna medicare", "aetna commercial"],
    "blue cross": [
        "blue cross", "bcbs", "bluecross", "blue cross blue shield", "bcbs of texas",
        "blue advantage", "bluechoice", "blue essentials", "blue premier", "myblue",
    ],
    "bcbs": [
        "bcbs", "blue cross", "bluecross", "blue cross blue shield", "bcbs of texas",
        "blue advantage", "bluechoice", "blue essentials",
    ],
    "baylor scott": ["baylor scott", "bsw health plan", "bsw premier", "bsw plus", "scott & white"],
    "bsw": ["baylor scott", "bsw health plan", "bsw premier", "bsw plus"],
    "united": ["unitedhealthcare", "united", "uhc", "united healthcare", "mgmcd"],
    "ambetter": ["ambetter", "superior healthplan", "superior health"],
    "sendero": ["sendero", "sendero health"],
    "oscar": ["oscar", "oscar health"],
    "cigna": ["cigna", "cigna healthcare"],
    "humana": ["humana", "humana medicare"],
    "medicare": ["medicare", "cms", "traditional medicare"],
    "medicaid": ["medicaid", "texas medicaid", "star", "chip"],
    "ambetter": ["ambetter", "superior healthplan"],
    "oscar": ["oscar", "oscar health"],
    "kaiser": ["kaiser", "kaiser permanente"],
    "self pay": ["self pay", "cash", "uninsured", "discount", "prompt pay"],
    "cash": ["cash", "self pay", "uninsured", "discount", "prompt pay"],
}


def match_condition_to_cpt(condition: str) -> list[str]:
    """Map a free-text condition/procedure to CPT code candidates."""
    if not condition:
        return []
    text = condition.lower().strip()

    # Direct match
    if text in PROCEDURE_INDEX:
        return PROCEDURE_INDEX[text]["cpt"]

    # Substring match
    for phrase, spec in PROCEDURE_INDEX.items():
        if phrase in text or text in phrase:
            return spec["cpt"]

    # Fallback: CPT code if user typed it raw
    if text.isdigit() and len(text) == 5:
        return [text]

    return []


def insurance_variants(name: str) -> list[str]:
    """Return normalized insurance aliases for payer matching."""
    if not name:
        return []
    key = name.lower().strip()
    return INSURANCE_ALIASES.get(key, [key])


def extract_patient_insurance_names(profile: dict) -> list[str]:
    """Return a list of insurance strings to match against MRF payers."""
    insurance = profile.get("insurance", "")
    if not insurance:
        return []
    return insurance_variants(insurance)
