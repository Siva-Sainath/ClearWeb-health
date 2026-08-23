"use strict";

/**
 * Fixed lines the scrape replay speaks verbatim. Edge TTS occasionally stalls ~19s
 * on a cold websocket, so these are synthesized at boot and served from the
 * in-process audio cache — the demo never falls back to the robotic browser voice
 * for them. Keep in sync with frontend/src/lib/scrapeNarration.ts.
 */
const SCRIPTED_REPLAY_LINES = [
  "Bright Data Scraper Studio had already opened each hospital's price-transparency page and found its CMS machine-readable file.",
  "Web Unlocker had downloaded those files through the sites' bot protection — we're replaying the saved copies.",
  "Inside each file we matched your request against that hospital's published rates — I'll name the exact code on the results screen.",
  "A few hospitals never published a usable rate, so we logged them as gaps instead of guessing.",
  "Watch the map — each spoke is a hospital site we captured, replayed at eight times speed.",
];

module.exports = { SCRIPTED_REPLAY_LINES };
