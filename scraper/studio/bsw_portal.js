/**
 * Scraper Studio interaction template — Baylor Scott & White price transparency
 * Worker: Browser
 */
// eslint-disable-next-line no-undef
navigate(input.url || 'https://www.bswhealth.com/patient-tools/price-transparency');
close_popup('#onetrust-banner-sdk', '#onetrust-accept-btn-handler');
wait_visible('a[href*="price"], a[href*=".json"], [data-testid*="download"]');
scroll_to('footer');
wait_for_text('machine-readable', 10000);

click('a[href*="austin"], text/Austin', { optional: true });
tag_download('a[href*=".json"]');

const data = parse();
collect({ mrf_url: data.mrf_url, facility_name: input.facility_name });
