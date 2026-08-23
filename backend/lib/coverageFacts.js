"use strict";

/** Keep in sync with frontend/src/lib/coverageFacts.ts */

const COVERAGE_BLOCK = `
AUSTIN DEMO COVERAGE (if they ask what you cover, read the lists. Do not invent other cities or CPTs):

ZIPS (all of them): 78701, 78702, 78703, 78704, 78705, 78712, 78731, 78732, 78733, 78734, 78735, 78741, 78744, 78745, 78746, 78747, 78748, 78749, 78750, 78751, 78752, 78753, 78754, 78756, 78757, 78758, 78759.
Cities: Austin, Round Rock, Travis County in those ZIPs. NOT Houston, Dallas, San Antonio, El Paso.

HOSPITALS IN CACHE: St. David's Medical Center; St. David's South Austin; St. David's North Austin; St. David's Round Rock; Heart Hospital of Austin; Baylor Scott & White Austin; Baylor Scott & White Round Rock; Dell Seton Medical Center at UT; Ascension Seton Medical Center Austin; Encompass Health Rehab Austin; Encompass Health Rehab Round Rock; Shriners Children's Texas.

PROCEDURES WITH REAL CPT ROWS:
- 72148 lumbar MRI without contrast (12 hospitals — densest)
- 72149 lumbar MRI with contrast
- 72158 lumbar MRI without then with contrast
- 45378 diagnostic colonoscopy
- 70553 brain MRI without then with contrast (1 hospital)
- 27447 total knee replacement (1 hospital)
- 44950 appendectomy (1 hospital)
- 99283 ER visit, low MDM (1 hospital)

NOT IN CACHE: knee MRI, CT, mammogram, hip replacement, labs, x-ray. Say so. Do not relabel 72148 as those CPTs.

INSURERS IN THE MRF ROWS: Aetna, Aetna Better Health, Meritain, Blue Cross Blue Shield of Texas, Cigna, UnitedHealthcare, Humana, Oscar, Molina, Superior Health Plan, Sendero, Amerigroup, Moda, MultiPlan/PHCS, Healthcare Highways, Harbor Health, Curative, Evry Health, Nomi Health, Covenant Management Systems, American Health Plan, Careworks workers' comp, cash/self-pay.
`;

module.exports = { COVERAGE_BLOCK };
