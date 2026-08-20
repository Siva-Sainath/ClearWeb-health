# Austin Demo Script — Real Data for Onboarding

Use this when rehearsing the Clearweb Health / Aria voice onboarding and results walkthrough. All insurance carriers, ZIP codes, and price ranges below are grounded in **published hospital MRF files** (CMS Price Transparency) and **2026 Travis County ACA issuer data** — not invented mock numbers.

---

## Recommended demo procedure

| Field | Value |
|-------|-------|
| **Condition (voice)** | "Lower back pain — my doctor wants an MRI" |
| **Procedure** | Lumbar spine MRI without contrast |
| **CPT code** | `72148` |
| **Why this procedure** | Common, relatable, and every Austin hospital publishes it in their MRF. Price spread across facilities is large enough to make comparison visually compelling. |

**Published Austin metro range for CPT 72148 (third-party aggregation of hospital MRFs):** roughly **$626 cash (rehab hospital)** to **$9,600+ cash (some St. David's facilities)**; typical hospital median ~**$2,055** ([MedRates.fyi Austin metro](https://medrates.fyi/metro/austin/72148)).

---

## Demo patient personas (pick one)

### Persona A — South Austin professional (recommended default)

| Field | Say this in onboarding |
|-------|------------------------|
| ZIP | **78704** (Zilker / South Congress / Travis Heights) |
| Insurance | **Blue Cross Blue Shield of Texas — PPO** (or "BCBS PPO") |
| Radius | **15 miles** |
| Priority | **Cost first**, then distance |
| Condition | "Lower back pain, need a lumbar MRI" |

**Why 78704:** Recognizable neighborhood, ~10 min to downtown hospitals, strong demo geography on the map.

### Persona B — Domain / North Austin tech worker

| Field | Value |
|-------|-------|
| ZIP | **78758** (The Domain / North Burnet) |
| Insurance | **UnitedHealthcare** (UHC) |
| Radius | **20 miles** |
| Priority | Distance, then cost |

### Persona C — Downtown / UT adjacent

| Field | Value |
|-------|-------|
| ZIP | **78701** (Downtown) or **78705** (UT campus) |
| Insurance | **Baylor Scott & White Health Plan** (local carrier — strong Austin story) |
| Radius | **10 miles** |
| Priority | Accreditation + wait time |

### Persona D — Uninsured / high-deductible

| Field | Value |
|-------|-------|
| ZIP | **78745** (South Austin residential) |
| Insurance | **Self-pay / cash** |
| Radius | **25 miles** |
| Priority | **Cost only** |

---

## Austin ZIP codes to reference on stage

| ZIP | Neighborhood / area | Good for demo because |
|-----|---------------------|------------------------|
| **78701** | Downtown Austin | Near Dell Seton (1500 Red River St); urban core |
| **78704** | Zilker, SoCo, Travis Heights | Default "Austin" vibe; south-central |
| **78705** | UT campus / West Campus | Near St. David's Medical Center |
| **78731** | Northwest Hills | Affluent north-central; longer drives to south hospitals |
| **78745** | South Austin (St. David's South area) | Close to St. David's South Austin Medical Center |
| **78758** | The Domain / North Burnet | North corridor; St. David's North Austin |
| **78759** | Arboretum | Northwest suburban |
| **78735** | Near BSW Austin (5245 W US Hwy 290) | Close to Baylor Scott & White Medical Center – Austin |

All listed ZIPs are in **Travis County** (Austin ACA rating area).

---

## Real insurance options in Austin (2026)

Use these names in onboarding — they appear in hospital MRF payer fields and/or Travis County marketplace enrollment.

### ACA Marketplace (HealthCare.gov) — Travis County, 2026

Per CMS marketplace data for Travis County, active issuers include:

| Issuer | Notes for demo |
|--------|----------------|
| **Blue Cross Blue Shield of Texas (BCBSTX)** | Largest network; appears in BSW MRF as "Blue Cross Blue Shield" with plans like Blue Advantage, BlueChoice PPO, Blue Essentials HMO |
| **UnitedHealthcare** | Common employer + marketplace; appears in HCA MRFs |
| **Oscar Health** | Tech-forward HMO; Travis County issuer |
| **Ambetter from Superior HealthPlan** | Often lowest Bronze/Silver premiums in Texas |
| **Baylor Scott & White Health Plan** | **Austin-specific** — great local color; appears in BSW hospital MRFs |
| **Sendero Health Plans** | Austin nonprofit, Central Texas focus |
| **Community Health Choice** | Available in Austin area |

**Important for 2026 demos:** **Aetna exited the individual Texas marketplace** at end of 2025, but **Aetna employer plans still appear in hospital MRFs** (e.g. "Aetna / ASA", "Aetna / Commercial"). Do not say "I bought Aetna on Healthcare.gov" — say "Aetna PPO through my employer" if using Aetna.

### Medicare / 65+ variant

- **Humana**, **UnitedHealthcare AARP**, **Scott & White Health Plan** — common in Central Texas Medicare Advantage.

### What to type in the app insurance field

| Demo intent | Insurance string |
|-------------|------------------|
| Most common PPO | `Blue Cross Blue Shield of Texas PPO` |
| UHC | `UnitedHealthcare` |
| Local Austin plan | `Baylor Scott & White Health Plan` |
| Budget marketplace | `Ambetter` |
| Employer Aetna | `Aetna PPO` |
| Cash | `Self-pay` or `Cash` |

---

## Hospital lineup — geographic spread + price diversity

Six facilities across Austin metro, **three health systems**, different neighborhoods. Seed URLs below are verified working MRF sources.

| # | Hospital | System | Domain | MRF |
|---|----------|--------|--------|-----|
| n1–n5 | St. David's (Medical, South, North, Round Rock, Heart) | HCA | stdavids.com | ✅ seed URLs |
| n6–n9 | Dell Seton, Seton Austin, Northwest, Southwest | Ascension | ascension.org | ⚠️ collectors pending |
| n10–n12 | BSW Austin, Round Rock, Lakeway | BSW | bswhealth.com | ✅ CSV seed URLs |

**Optional swap for stronger price spread:** Replace n5 with **BSW Medical Center – Round Rock** (same CSV portal, north suburb) or add **Encompass Health Rehabilitation Hospital of Austin** (~$1,303 cash for 72148 — lowest in metro per published MRF aggregators).

---

## Verified price samples — CPT 72148 (lumbar MRI w/o contrast)

Pulled from hospital machine-readable files (sample/partial parse). **Your live scrape may differ slightly** by payer plan string match.

### Baylor Scott & White Medical Center – Austin  
Source: `813040663_baylor-scott--white-medical-center--austin_standardcharges.csv`

| Payer (from MRF) | Negotiated rate |
|------------------|-----------------|
| Discounted cash / gross | **$2,065.69** cash (gross $3,442.81) |
| Min / max negotiated band | **$197.14 – $2,582.11** |
| Aetna Commercial | $1,893.55 |
| Blue Cross Blue Shield — Blue Advantage | $985.76 |
| Blue Cross Blue Shield — BlueChoice (PPO) | $1,188.50 |
| Blue Cross Blue Shield — Blue Essentials (HMO) | $1,127.91 |
| Baylor Scott & White Health Plan | $1,731 – $2,037 |

### St. David's South Austin Medical Center  
Source: HCA JSON MRF (partial sample)

| Payer (from MRF) | Negotiated rate |
|------------------|-----------------|
| United / MGMCD | **~$203** (outlier-low — verify plan match) |
| Aetna / ASA | **~$2,945** |
| Aetna / QHP Exchange (HIX) | ~$1,759 |

**Demo talking point:** Same procedure, same city, **10×+ spread** depending on hospital + payer — exactly what Clearweb surfaces.

---

## Suggested voice script (90 seconds)

**Aria:** "What procedure are you trying to price?"

**You:** "My doctor ordered a lumbar MRI for back pain."

**Aria:** "What's your ZIP code?"

**You:** "78704."

**Aria:** "Who's your insurance?"

**You:** "Blue Cross Blue Shield of Texas PPO."

**Aria:** "I'll search Austin hospital price files for CPT 72148 and compare cash and in-network rates near you."

→ Scrape canvas animates across **stdavids.com**, **bswhealth.com**, **ascension.org** nodes.

**Results beat:** "BSW Austin shows BCBS BlueChoice around **$1,188**, while St. David's South Austin shows a different payer mix — here's the map from your ZIP."

---

## What `MRF_SAMPLE_MB=15` means (backend)

Hospital JSON MRF files (especially HCA) can be **~1 GB each**. Downloading the full file on every user query takes 10+ minutes.

The backend sets `MRF_SAMPLE_MB=15` when spawning the Python scraper: only the **first 15 MB** of each MRF is downloaded via HTTP Range request. That is enough to extract thousands of procedure rows for demo CPT codes in seconds, but:

- Not every CPT may appear in the first 15 MB of every file
- Partial files use `allow_partial` parsing in the normalizer
- **Production** should use full download + cache (watcher pre-warms overnight)

For the demo, 15 MB is the right tradeoff: **fast UI, real prices**.

---

## Quick reference — phone numbers (public)

| Hospital | Scheduling / main |
|----------|-------------------|
| St. David's (HCA) | (512) 544-4240 |
| Dell Seton | (512) 324-7000 |
| BSW Austin | (512) 654-1000 |

---

## Sources

- CMS Hospital Price Transparency Rule — hospital-published MRFs
- Travis County ACA issuers: [PlainHealthPlan Travis County 2026](https://plainhealthplan.com/county/travis-tx)
- Austin metro 72148 comparison: [MedRates.fyi](https://medrates.fyi/metro/austin/72148)
- BSW facility list + MRF index: [BSW Estimate Your Cost of Care](https://www.bswhealth.com/patient-tools/registration-and-billing/estimate-your-cost-of-care)
- HCA St. David's transparency portal: [stdavids.com pricing transparency](https://www.stdavids.com/patient-resources/patient-financial-resources/pricing-transparency-cms-required-file-of-standard-charges)
