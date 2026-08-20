/**
 * Scraper Studio interaction template — HCA / St. David's shared portal
 * Worker: Browser
 *
 * Bright Data functions used:
 *   navigate, close_popup, wait_visible, click, wait_network_idle, tag_download
 *
 * Paste into Scraper Studio IDE → Interaction code, or reference in create/heal prompts.
 */
// eslint-disable-next-line no-undef
navigate(input.url || input.price_transparency_page);
close_popup('[class*="cookie"]', '[class*="accept"], #onetrust-accept-btn-handler, button[aria-label*="Accept"]');
wait_visible('a[href*="blob.core.windows.net"], a[download], .download');
wait_network_idle(3000);

// Facility-specific: match hospital name in download section
const facility = input.facility_name || input.hospital_name;
if (facility) {
  wait_for_text(facility, 15000);
  click(`a:contains("${facility}")`, { optional: true });
}

tag_download('a[href*=".json"]');
const data = parse();
collect({
  mrf_url: data.mrf_url || data.download_url,
  facility_name: facility,
  pricing_files: data.pricing_files || [],
});
