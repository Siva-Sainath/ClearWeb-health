"use strict";

/**
 * Scrape context — how scraping was done, for brain prompts and UI trust panel.
 */

function healEventsFromLogs(events = []) {
  const succeeded = new Set(
    events
      .filter((e) => e.event === "price_extracted" && e.hospital_id)
      .map((e) => e.hospital_id)
  );
  const out = [];
  for (const e of events) {
    if (e.event === "heal_triggered") {
      out.push({
        timestamp: e.ts,
        collector_id: e.collector_id,
        reason: e.detail,
        success: e.hospital_id ? succeeded.has(e.hospital_id) : false,
      });
    } else if (e.event === "heal_resumed") {
      out.push({
        timestamp: e.ts,
        collector_id: e.collector_id,
        reason: e.detail,
        success: true,
      });
    } else if (e.event === "heal_failed") {
      out.push({
        timestamp: e.ts,
        collector_id: e.collector_id,
        reason: e.detail,
        success: false,
      });
    }
  }
  return out.slice(-10);
}

function buildReplayTimeline(events = []) {
  const timeline = [];
  for (const e of events) {
    const name = e.facility_name || e.collector_name || e.collector_id || "Hospital";
    switch (e.event) {
      case "collector_started":
        timeline.push({ ts: e.ts, phase: "start", label: `Opened ${name} price transparency portal` });
        break;
      case "page_loaded":
        timeline.push({ ts: e.ts, phase: "navigate", label: `Loaded transparency page for ${name}` });
        break;
      case "mrf_downloaded":
        timeline.push({
          ts: e.ts,
          phase: "download",
          label: e.cache_hit
            ? `Loaded cached MRF for ${name}`
            : `Downloaded live MRF for ${name} via Web Unlocker`,
          cacheHit: !!e.cache_hit,
        });
        break;
      case "price_extracted":
        timeline.push({
          ts: e.ts,
          phase: "extract",
          label: `Extracted ${e.cpt_code || "procedure"} price from ${name}`,
          nodeId: e.node_id,
        });
        break;
      case "heal_triggered":
        timeline.push({ ts: e.ts, phase: "heal", label: e.detail || `Self-healing ${name}`, success: null });
        break;
      case "heal_resumed":
        timeline.push({ ts: e.ts, phase: "heal_ok", label: e.detail || `Heal succeeded for ${name}`, success: true });
        break;
      case "heal_failed":
        timeline.push({ ts: e.ts, phase: "heal_fail", label: e.detail || `Heal failed for ${name}`, success: false });
        break;
      case "extraction_failed":
        timeline.push({ ts: e.ts, phase: "fail", label: e.detail || `Could not read prices at ${name}` });
        break;
      case "rate_limited":
        timeline.push({ ts: e.ts, phase: "retry", label: `Rate limited at ${name} — retried` });
        break;
      default:
        break;
    }
  }
  return timeline;
}

function buildScrapeContext({ events = [], replayEvents = [], healEvents = [], presentationMode = "proof-reel" }) {
  const replay = replayEvents.length ? replayEvents : events;
  let cacheHits = 0;
  let liveDownloads = 0;
  let healTriggered = 0;
  let extractions = 0;
  let failures = 0;
  const collectors = new Set();

  for (const e of replay) {
    if (e.collector_id) collectors.add(e.collector_id);
    if (e.event === "mrf_downloaded") {
      if (e.cache_hit) cacheHits += 1;
      else liveDownloads += 1;
    }
    if (e.event === "heal_triggered") healTriggered += 1;
    if (e.event === "price_extracted") extractions += 1;
    if (e.event === "extraction_failed") failures += 1;
  }

  const heals = healEvents.length ? healEvents : healEventsFromLogs(replay);
  const healSuccess = heals.filter((h) => h.success).length;

  const dataSource =
    presentationMode === "live"
      ? "live_scrape"
      : presentationMode === "instant"
        ? "cached_instant"
        : cacheHits > 0 && liveDownloads === 0
          ? "cached_replay"
          : liveDownloads > 0
            ? "mixed_live_and_cache"
            : "cached_replay";

  const honestyLine =
    presentationMode === "live"
      ? "Prices came from a live Bright Data scrape that just finished."
      : presentationMode === "instant"
        ? "Prices loaded instantly from our verified hospital price database."
        : cacheHits > 0 && liveDownloads === 0
          ? `Verified replay of real scrape events at 8× speed; ${cacheHits} MRF files from disk cache.`
          : `Bright Data collectors + Web Unlocker; ${liveDownloads} live download(s), ${cacheHits} from cache.`;

  const methodSummary =
    healTriggered > 0
      ? `Self-healing ran ${healTriggered} time(s) (${healSuccess} recovered). Collectors use Scraper Studio + cms-hpt discovery.`
      : "Collectors navigated hospital transparency portals and parsed CMS machine-readable price files (MRF).";

  return {
    dataSource,
    honestyLine,
    methodSummary,
    stats: {
      collectorsVisited: collectors.size,
      cacheHits,
      liveDownloads,
      healTriggered,
      healSuccess,
      pricesExtracted: extractions,
      extractionFailures: failures,
    },
    healEvents: heals,
    replayTimeline: buildReplayTimeline(replay),
    replayEventCount: replay.length,
  };
}

function scrapeContextBlock(ctx) {
  if (!ctx) return "";
  const lines = [
    `DATA SOURCE: ${ctx.honestyLine}`,
    `SCRAPE METHOD: ${ctx.methodSummary}`,
    `STATS: ${ctx.stats.collectorsVisited} sites, ${ctx.stats.cacheHits} cache hits, ${ctx.stats.liveDownloads} live downloads, ${ctx.stats.healTriggered} heals (${ctx.stats.healSuccess} ok), ${ctx.stats.pricesExtracted} prices extracted.`,
  ];
  if (ctx.replayTimeline?.length) {
    const recent = ctx.replayTimeline.slice(-8).map((t) => `- ${t.label}`).join("\n");
    lines.push(`REPLAY TIMELINE (recent):\n${recent}`);
  }
  return lines.join("\n");
}

module.exports = {
  buildScrapeContext,
  buildReplayTimeline,
  healEventsFromLogs,
  scrapeContextBlock,
};
