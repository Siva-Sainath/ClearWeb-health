/** Honest Austin demo coverage — keep in sync with backend/lib/coverageFacts.js */

export const COVERAGE_AREA =
  "Austin metro only — ZIP codes 78701 through 78759. Downtown 78701 is the best demo ZIP. Houston, Dallas, and San Antonio are not in the consumer price cache.";

export const COVERAGE_PROCEDURES = [
  "lumbar / lower-back MRI",
  "colonoscopy",
  "brain MRI",
  "knee replacement",
  "appendectomy",
  "some emergency-department visits",
] as const;

export const COVERAGE_INSURERS = [
  "Aetna",
  "Blue Cross Blue Shield",
  "Cigna",
  "UnitedHealthcare",
  "Humana",
  "Oscar",
  "Molina",
  "Superior / Sendero Medicaid plans",
] as const;

export function getCoverageWelcomeSpoken(agentName: string): string {
  return (
    `Hi, I'm ${agentName}. I have real scraped hospital prices for Austin metro — any 787 ZIP, ` +
    `especially 78701 downtown. I already have files for lumbar MRI, colonoscopy, brain MRI, ` +
    `knee replacement, appendectomy, and some ER visits, matched to Aetna, Blue Cross, Cigna, ` +
    `United, Humana, Oscar, and Molina. Houston and Dallas aren't in this cache yet. ` +
    `What do you need priced today?`
  );
}
