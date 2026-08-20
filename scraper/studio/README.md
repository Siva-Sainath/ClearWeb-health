# Scraper Studio interaction templates

These files document the **Bright Data Scraper Studio functions** each hospital system needs.
Use them when creating collectors (`bdata scraper create`) or healing (`bdata scraper heal`).

| File | System | Key functions |
|------|--------|---------------|
| `hca_portal.js` | St. David's / HCA | `navigate`, `close_popup`, `wait_visible`, `click`, `tag_download` |
| `ascension_portal.js` | Ascension Seton | `navigate`, `click`, `wait_for_text`, `scroll_to`, `tag_download` |
| `bsw_portal.js` | Baylor Scott & White | `navigate`, `close_popup`, `scroll_to`, `tag_download` |

**Heal prompt tip:** Reference the exact function that broke, e.g.:
> The `wait_visible('a[href*=".json"]')` times out after the footer redesign. Use `tag_response('/api/pricing')` instead.

Create collector with studio template context:
```bash
bdata scraper create <url> "Use Browser worker. $(cat scraper/studio/hca_portal.js logic). Return mrf_url for <facility>."
```
