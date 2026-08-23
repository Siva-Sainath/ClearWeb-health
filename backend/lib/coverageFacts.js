"use strict";

/** Keep in sync with frontend/src/lib/coverageFacts.ts */

const COVERAGE_BLOCK = `
AUSTIN DEMO COVERAGE (say this only if they ask, or if they pick an unsupported city/procedure — do not invent a national catalog):
- Geography: Austin metro only. Working ZIPs are 78701–78759. Best demo ZIP is 78701. Houston, Dallas, San Antonio, El Paso = no consumer price cache.
- Procedures with real scraped CPT rows: lumbar MRI (72148, strongest — 12 hospitals), colonoscopy (45378), brain MRI (70553, 1 hospital), knee replacement (27447, 1 hospital), appendectomy (44950), some ER visits (99283).
- NOT in the cache: knee MRI, CT, mammogram, hip replacement, labs, x-ray. If they ask for those, say so honestly, still collect insurance + Austin ZIP, and do not pretend the dollars are that CPT.
- Insurers seen in scraped MRFs: Aetna, Blue Cross Blue Shield, Cigna, UnitedHealthcare, Humana, Oscar, Molina, Superior, Sendero, plus cash/self-pay rows.
`;

module.exports = { COVERAGE_BLOCK };
