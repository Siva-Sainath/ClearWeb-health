/** Honest Austin demo coverage — keep in sync with backend/lib/coverageFacts.js */

/** ZIPs in ZIP_COORDS that the matcher will price (Austin metro). */
export const COVERAGE_ZIPS = [
  "78701",
  "78702",
  "78703",
  "78704",
  "78705",
  "78712",
  "78731",
  "78732",
  "78733",
  "78734",
  "78735",
  "78741",
  "78744",
  "78745",
  "78746",
  "78747",
  "78748",
  "78749",
  "78750",
  "78751",
  "78752",
  "78753",
  "78754",
  "78756",
  "78757",
  "78758",
  "78759",
] as const;

/** CPTs with real rows in chargemaster.db — do not price anything else. */
export const CACHED_CPTS = [
  "72148",
  "72149",
  "72158",
  "45378",
  "70553",
  "27447",
  "44950",
  "99283",
] as const;

export const COVERAGE_CITIES =
  "Austin, Round Rock, and the rest of Travis County in those ZIPs — not Houston, Dallas, San Antonio, or El Paso";

export const COVERAGE_HOSPITALS = [
  "St. David's Medical Center",
  "St. David's South Austin Medical Center",
  "St. David's North Austin Medical Center",
  "St. David's Round Rock Medical Center",
  "Heart Hospital of Austin",
  "Baylor Scott & White Medical Center — Austin",
  "Baylor Scott & White Medical Center — Round Rock",
  "Dell Seton Medical Center at UT",
  "Ascension Seton Medical Center Austin",
  "Encompass Health Rehabilitation Hospital of Austin",
  "Encompass Health Rehabilitation Hospital of Round Rock",
  "Shriners Children's Texas",
] as const;

export const COVERAGE_PROCEDURES = [
  "lumbar MRI without contrast (CPT 72148) — 12 hospitals",
  "lumbar MRI with contrast (CPT 72149)",
  "lumbar MRI without then with contrast (CPT 72158)",
  "diagnostic colonoscopy (CPT 45378)",
  "brain MRI without then with contrast (CPT 70553)",
  "total knee replacement (CPT 27447)",
  "appendectomy (CPT 44950)",
  "emergency department visit, low MDM (CPT 99283)",
] as const;

export const COVERAGE_INSURERS = [
  "Aetna",
  "Aetna Better Health",
  "Meritain (Aetna)",
  "Blue Cross Blue Shield of Texas",
  "Cigna",
  "UnitedHealthcare",
  "Humana",
  "Oscar",
  "Molina Healthcare",
  "Superior Health Plan",
  "Sendero",
  "Amerigroup",
  "Moda Health",
  "MultiPlan / PHCS",
  "Healthcare Highways",
  "Harbor Health",
  "Curative",
  "Evry Health",
  "Nomi Health",
  "Covenant Management Systems",
  "American Health Plan",
  "Careworks workers' compensation",
  "cash / self-pay",
] as const;

export function getCoverageWelcomeChunks(agentName: string): string[] {
  return [
    `Hi, I'm ${agentName}.`,
    `Look to your right. Tap See what Aria can price for every ZIP, hospital, treatment, and insurer I already have scraped. What do you need priced today?`,
  ];
}

export function getCoverageWelcomeSpoken(agentName: string): string {
  return getCoverageWelcomeChunks(agentName).join(" ");
}
