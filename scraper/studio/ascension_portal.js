/**
 * Scraper Studio interaction template — Ascension price transparency
 * Worker: Browser
 *
 * Functions: navigate, click, wait_visible, wait_for_text, type, scroll_to
 */
// eslint-disable-next-line no-undef
navigate(input.url || 'https://healthcare.ascension.org/price-transparency');
close_popup('[class*="cookie"]', 'button[id*="accept"], .accept-cookies');
wait_visible('select, [role="combobox"], a[href*="machine"]');

// Texas → hospital selection flow
click('text/Texas', { optional: true });
wait_for_text(input.facility_name || 'Dell Seton', 20000);
click(`text/${input.facility_name}`, { optional: true });
wait_visible('a[href*=".json"], a[download]');
tag_download('a[href*=".json"]');

const data = parse();
collect({
  mrf_url: data.mrf_url,
  facility_name: input.facility_name,
});
