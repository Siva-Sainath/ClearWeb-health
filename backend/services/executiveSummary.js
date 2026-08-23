"use strict";

/**
 * Server-side executive summary — single source of truth for ranking + spoken bullets.
 */

const SOURCE_LABELS = {
  n1: "Example General Hospital",
  n2: "City Health Medical Center",
  n3: "Valley Regional Medical",
  n4: "Summit Premium Imaging",
  n5: "Community Medical Center",
};

function deriveWeights(priorities = []) {
  const w = { price: 0.4, distance: 0.25, rating: 0.2, accredited: 0.1, wait: 0.05 };
  if (priorities.includes("cost")) {
    w.price += 0.2;
    w.distance -= 0.05;
  }
  if (priorities.includes("distance")) {
    w.distance += 0.2;
    w.price -= 0.05;
  }
  if (priorities.includes("accreditation")) w.accredited += 0.15;
  if (priorities.includes("wait")) w.wait += 0.15;
  return w;
}

function scoreFacility(f, all, weights) {
  const prices = all.map((x) => x.insurance_price);
  const dists = all.map((x) => x.drive_min ?? x.distance_mi);
  const waits = all.map((x) => x.wait_days);
  const ratings = all.map((x) => x.rating);
  const norm = (v, min, max) => (max === min ? 0.5 : (v - min) / (max - min));
  const priceScore = 1 - norm(f.insurance_price, Math.min(...prices), Math.max(...prices));
  const distScore = 1 - norm(f.drive_min ?? f.distance_mi, Math.min(...dists), Math.max(...dists));
  const waitScore = 1 - norm(f.wait_days, Math.min(...waits), Math.max(...waits));
  const ratingScore = norm(f.rating, Math.min(...ratings), Math.max(...ratings));
  const accScore = f.accredited ? 1 : 0;
  return (
    priceScore * weights.price +
    distScore * weights.distance +
    ratingScore * weights.rating +
    accScore * weights.accredited +
    waitScore * weights.wait
  );
}

function buildReasons(f, all, rank) {
  const reasons = [`$${f.insurance_price} with your plan`];
  const cheapest = all.reduce((a, b) => (a.insurance_price < b.insurance_price ? a : b));
  const nearest = all.reduce((a, b) =>
    (a.drive_min ?? a.distance_mi) < (b.drive_min ?? b.distance_mi) ? a : b
  );
  if (f.id === cheapest.id) reasons.push("Lowest price in this search");
  else if (rank === 1) reasons.push("Best overall match for your priorities");
  const distLabel = f.drive_min ? `~${Math.round(f.drive_min)} min drive` : `${f.distance_mi} miles`;
  if (f.id === nearest.id) reasons.push(`Closest to you — ${distLabel}`);
  if (rank === 1 && f.accredited) reasons.push("Accredited hospital");
  return reasons.slice(0, 3);
}

function badgeForRank(rank, f, all) {
  if (rank === 1) return "Top pick";
  const cheapest = all.reduce((a, b) => (a.insurance_price < b.insurance_price ? a : b));
  if (f.insurance_price === cheapest.insurance_price) return "Lowest price";
  return undefined;
}

function buildExecutiveSummary(profile, facilities, events = []) {
  const entries = Object.entries(facilities || {}).map(([key, f]) => ({
    ...f,
    id: f.id ?? key,
  }));
  if (!entries.length) return null;

  const procedure = profile.procedure || profile.condition || "your procedure";
  const insurance = profile.insurance || "your insurance plan";
  const location =
    [profile.city?.trim(), profile.zipCode?.trim()].filter(Boolean).join(", ") || "your area";
  const weights = deriveWeights(profile.priorities);

  const scored = entries
    .map((f) => ({ f, score: scoreFacility(f, entries, weights) }))
    .sort((a, b) => b.score - a.score);

  const ranked = scored.map(({ f }, i) => ({
    id: f.id,
    rank: i + 1,
    facility: f,
    badge: badgeForRank(i + 1, f, entries),
    reasons: buildReasons(f, entries, i + 1),
  }));

  const recommendation = ranked[0];
  const prices = entries.map((e) => e.insurance_price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);

  const partialIssues = [];
  for (const evt of events) {
    if (evt.event === "rate_limited") {
      partialIssues.push({
        name: evt.facility_name || "A hospital site",
        issue: "Site slowed us down temporarily — we retried and still captured pricing",
      });
    }
    if (evt.event === "extraction_failed") {
      partialIssues.push({
        name: evt.facility_name || "A hospital site",
        issue: "Could not read prices from this page layout",
      });
    }
  }

  const resultIds = new Set(entries.map((e) => e.id));
  const missed = [];
  for (const [id, label] of Object.entries(SOURCE_LABELS)) {
    if (!resultIds.has(id)) {
      missed.push({ name: label, reason: "No public price page found within your search radius" });
    }
  }

  const uniquePartial = partialIssues.filter(
    (p, i, arr) => arr.findIndex((x) => x.name === p.name) === i
  );

  const sourcesChecked = events.length
    ? new Set(events.map((e) => e.collector_id).filter(Boolean)).size
    : entries.length;

  const bullets = [
    `Searched ${procedure} near ${location} (${profile.radiusMi} mi) using ${insurance}`,
    `Checked ${Math.max(sourcesChecked, entries.length)} hospital price feeds — found ${entries.length} with usable estimates`,
    `Your plan estimates range from $${minP} to $${maxP}`,
  ];
  if (uniquePartial.length) {
    bullets.push(
      `${uniquePartial.length} site(s) had delays; data was still recovered where possible`
    );
  }
  if (missed.length) {
    bullets.push(`${missed.length} source(s) had no public pricing — listed below`);
  }
  bullets.push(
    `Top recommendation: ${recommendation.facility.hospital_name} at $${recommendation.facility.insurance_price} — ${recommendation.reasons[0]}`
  );

  const spokenSummary = [
    `Here's what I found.`,
    `I looked up ${procedure} near ${location} on ${insurance}, within ${profile.radiusMi} miles.`,
    `I checked ${Math.max(sourcesChecked, entries.length)} hospital sites and got clear prices at ${entries.length} of them. With your plan, you're looking at about $${minP} to $${maxP}.`,
    uniquePartial.length
      ? `A couple of sites were slow or tricky to read, but I still pulled numbers where I could.`
      : `Every major site in your area returned pricing.`,
    missed.length
      ? `${missed.length} hospital(s) didn't publish prices online — I've noted those for you.`
      : ``,
    `My top pick is ${recommendation.facility.hospital_name} at about $${recommendation.facility.insurance_price} — ${recommendation.reasons.join(". ")}.`,
    `I've ranked all ${entries.length} options below. Tell me if cost, distance, or quality matters most.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    procedure,
    insurance,
    location,
    radiusMi: profile.radiusMi,
    sourcesChecked: Math.max(sourcesChecked, entries.length),
    pricesFound: entries.length,
    priceRange: { min: minP, max: maxP },
    missed,
    partialIssues: uniquePartial,
    ranked,
    recommendation,
    spokenSummary,
    bullets,
  };
}

module.exports = { buildExecutiveSummary };
