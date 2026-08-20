# Issues & Resolutions — Austin Scraper Build

## 1. Bright Data Studio UI showed no scrapers

**Observation:** User screenshot showed "My scrapers" tab empty with count 0.

**Cause:** I was using the CLI + direct HTTP discovery, not the Studio web UI. No collectors had been created in the dashboard yet.

**Resolution:** Created 6 collectors via `npx -p @brightdata/cli bdata scraper create`. Now 5 IDs exist in the dashboard (1 creation failed).

## 2. HCA MRF files are ~1 GB each

**Observation:** Full download of a single hospital MRF took >10 minutes and blocked the live demo.

**Cause:** HCA St. David's publishes one large JSON MRF per facility (or per NPI) on Azure blob storage. Direct HTTP GET of the full file is free but slow.

**Resolution:** Implemented `MRF_SAMPLE_MB` environment variable and HTTP Range requests to download only the first N MB for fast demo/iteration. Added `allow_partial` mode in `normalize_file` so `ijson` gracefully stops at EOF. For production, a background watcher/full download can run once and cache.

**Status:** Working for demo. Full download still needed for production completeness.

## 3. `heal_collector` failed with `No such file or directory: 'brightdata'`

**Observation:** The self-heal call raised `FileNotFoundError` because `brightdata` binary was not on PATH.

**Cause:** I had updated `create_collector` and `run_collector` to use `npx -p @brightdata/cli bdata`, but `heal_collector` in `pipeline/heal.py` still used the bare `brightdata` command.

**Resolution:** Updated `heal_collector` to use `npx -p @brightdata/cli bdata scraper heal`.

## 4. Fake/simulated heal flow

**Observation:** `run_job.py` had a `--demo-heal` flag that deliberately broke the first hospital URL, then re-discovered with `broken=False` to simulate a successful heal. This was staged, not real.

**Cause:** I added a quick demo path to prove the UI animation worked before real collectors were ready.

**Resolution:** Removing the fake `--demo-heal` path. Real self-healing will now: run collector → validate → on failure call `heal_collector` → re-run collector → validate again. No manual URL breakage.

**Status:** In progress. Need to test a real heal on a broken collector.

## 5. Corrupt cache from killed download

**Observation:** First full download was killed mid-stream, leaving a truncated file. Subsequent runs re-used the corrupt file and got `parse error: premature EOF`.

**Cause:** The cache only checks file size > 1024 bytes, not completeness.

**Resolution:** Cleared cache and added `MRF_SAMPLE_MB` mode. Longer term, cache should include a checksum or content-length check.

## 6. Collector creation failures

**Observation:** `ascension_seton_austin` collector creation failed with `AI generation finished with status "error"`.

**Cause:** Bright Data AI Flow could not generate a working scraper for the Ascension price transparency page from the provided prompt. Concurrent job caps also slowed/rejected other creations.

**Resolution:** Will retry with a different prompt or use the Scraper Studio web IDE to manually build the collector. The other 5 collectors have IDs.

**Status:** Unresolved for Ascension Seton Austin. 5 of 6 collectors created.

## 7. Dell Seton collector returned empty results

**Observation:** `bdata scraper run c_mt170jgmk4v6gtqml` returned `[]`.

**Cause:** Collector likely did not navigate the Texas → hospital selection hierarchy correctly.

**Resolution:** Will heal the collector with a specific prompt about selecting Texas then the facility name.

**Status:** Pending heal test.

## 8. BSW collector navigation aborted

**Observation:** `bdata scraper run c_mt170mssv9p1942lp` returned repeated `net_err_aborted` errors.

**Cause:** BSW site may be blocking the crawler, redirecting, or requiring cookie acceptance. The URL may also redirect to a different page.

**Resolution:** Will heal the collector with a prompt about handling the redirect/cookie banner and finding the Austin-specific MRF link.

**Status:** Pending heal test.

## 9. HCA collector returns all facilities in one run

**Observation:** St. David's collector returns a `standard_charges_files` array with URLs for 9 facilities, not just one.

**Cause:** The HCA portal is a shared page listing all facilities.

**Resolution:** Updated `run_collector` parsing to handle `standard_charges_files` and match the requested facility name. We can use one HCA collector for all 3 St. David's hospitals.

## 10. Need full procedure + insurance coverage, not just MRI Brain

**Observation:** Early tests only tracked 5 CPT codes (70553, 27447, 99283, 45378, 44950).

**Cause:** The original pipeline was built for a single-hospital validation demo.

**Resolution:** Built `cpt_index.py` with common procedures → CPT mappings, `match_engine.py` for insurance-aware payer matching, and set `filter_codes=None` to keep all rows from the MRF. The UI will now match the patient's condition/procedure to the scraped data and pick the best payer price.

**Status:** Code ready. Need to run end-to-end test with real sample data.

## 11. Need to document all data points from onboarding

**Observation:** Patient profile includes condition, procedure, cptCode, insurance, zipCode, radiusMi, priorities, documentNames. Need to ensure all relevant fields are used in ranking.

**Resolution:** Match engine uses condition/procedure/cptCode for CPT matching, insurance for payer matching, zipCode for distance, priorities for score weights. radiusMi is surfaced in executive summary. documentNames is not used for pricing (it is for prior documents).

**Status:** Wired in Python. Need to verify frontend receives and displays correctly.
