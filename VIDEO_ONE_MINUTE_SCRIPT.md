# One-minute submission script (~60 seconds)

Read at a natural pace (~150 words/min). Pair with `docs/architecture-diagram.png` for the stack section.

---

## Full script (single take)

**About the project**

Hospital prices live in giant machine-readable files, but patients still can't shop. **Clearweb Health** fixes that with **Aria**, a voice agent that walks you through what you need — ZIP, insurance, procedure — then shows real hospital prices side by side. We're honest about scope: Austin metro today, verified MRF data, not fake nationwide coverage.

**Tech stack and architecture**

The frontend is **Next.js** with a voice-first onboarding flow. One API call — `POST /api/scrape/session` — loads prices, replay events, and the results walkthrough. **Node** runs the brain service; **Python** handles scraping against **Bright Data** collectors, Web Unlocker, and self-healing when a site breaks. Voice uses **Groq** for chat and **Edge TTS** for Aria. Cached prices sit in **SQLite**; the default demo plays a proof-reel of a real scrape at eight-times speed.

**Learning and growth**

I learned that healthcare data is messy — every hospital publishes differently — so collectors and heal paths matter as much as the UI. The bigger lesson was **honesty as product**: label cached vs live, show collector IDs, admit when a CPT isn't in cache. Voice added latency tradeoffs I solved with prefetch and one consistent TTS voice. Next step: ingest beyond Austin and harden the live scrape path.

---

## Timing guide

| Block | ~Seconds | Words |
|-------|----------|-------|
| About the project | 20 | ~50 |
| Tech stack + architecture | 22 | ~55 |
| Learning and growth | 18 | ~45 |
| **Total** | **~60** | **~150** |

---

## Diagram voiceover cue

When showing `docs/architecture-diagram.png`, say:

> "Left to right: voice onboarding, brain session, proof-reel replay, results. Below that — Next.js, Express, brain service, Python scraper, then SQLite and Bright Data underneath."
