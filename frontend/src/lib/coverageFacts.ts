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

function speakZip(zip: string): string {
  return zip.split("").join(" ");
}

export function getCoverageWelcomeChunks(agentName: string): string[] {
  const zips = COVERAGE_ZIPS.map(speakZip).join(", ");
  return [
    `Hi, I'm ${agentName}. I only have consumer prices for Austin metro. The ZIPs I can search are ${zips}.`,
    `Hospitals already in the cache: ${COVERAGE_HOSPITALS.join("; ")}.`,
    `Treatments with real scraped rows: ${COVERAGE_PROCEDURES.join("; ")}.`,
    `Insurers in those files: ${COVERAGE_INSURERS.join(", ")}. I do not have Houston or Dallas consumer prices. What do you need priced today?`,
  ];
}

export function getCoverageWelcomeSpoken(agentName: string): string {
  return getCoverageWelcomeChunks(agentName).join(" ");
}
