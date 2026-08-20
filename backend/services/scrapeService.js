"use strict";

const crypto = require("crypto");
const path = require("path");
const { spawn } = require("child_process");
const { env } = require("../config/env");

/** @type {Map<string, object>} */
const jobs = new Map();

const AUSTIN_NODES = [
  { id: "n1", domain: "stdavids.com", label: "St. David's Medical" },
  { id: "n2", domain: "stdavids.com", label: "South Austin" },
  { id: "n3", domain: "stdavids.com", label: "North Austin" },
  { id: "n4", domain: "stdavids.com", label: "Round Rock" },
  { id: "n5", domain: "stdavids.com", label: "Heart Hospital" },
  { id: "n6", domain: "bswhealth.com", label: "BSW Austin" },
  { id: "n7", domain: "bswhealth.com", label: "BSW Round Rock" },
  { id: "n8", domain: "ascension.org", label: "Dell Seton" },
  { id: "n9", domain: "ascension.org", label: "Seton Northwest" },
  { id: "n10", domain: "ascension.org", label: "Seton Austin" },
  { id: "n11", domain: "westlakemedical.com", label: "Westlake Medical" },
  { id: "n12", domain: "austinoakshospital.com", label: "Austin Oaks" },
  { id: "n13", domain: "encompasshealth.com", label: "Encompass Austin" },
  { id: "n14", domain: "encompasshealth.com", label: "Encompass RR" },
  { id: "n15", domain: "shrinerschildrens.org", label: "Shriners Texas" },
  { id: "n16", domain: "christushealth.org", label: "Santa Rosa SM" },
  { id: "n17", domain: "christushealth.org", label: "Santa Rosa NB" },
];

const MAX_HOSPITALS = AUSTIN_NODES.length;
const STUCK_JOB_MS = parseInt(process.env.SCRAPE_STUCK_TIMEOUT_MS || "480000", 10); // 8 min
const WATCHDOG_INTERVAL_MS = 15000;

function getPythonPath() {
  if (env.SCRAPER_PYTHON) return env.SCRAPER_PYTHON;
  return path.join(__dirname, "../../scraper/.venv/bin/python");
}

function summarizeEvents(events) {
  let cacheHits = 0;
  let liveDownloads = 0;
  for (const evt of events) {
    if (evt.event === "mrf_downloaded") {
      if (evt.cache_hit) cacheHits += 1;
      else liveDownloads += 1;
    }
  }
  return { cacheHits, liveDownloads, totalDownloads: cacheHits + liveDownloads };
}

function touchJob(job) {
  job.lastEventAt = Date.now();
}

function clearWatchdog(job) {
  if (job.watchdogTimer) {
    clearInterval(job.watchdogTimer);
    job.watchdogTimer = null;
  }
}

function startWatchdog(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  clearWatchdog(job);
  job.watchdogTimer = setInterval(() => {
    const current = jobs.get(jobId);
    if (!current || current.status !== "running") {
      clearWatchdog(current);
      return;
    }
    const idle = Date.now() - (current.lastEventAt || current.startedAt);
    if (idle >= STUCK_JOB_MS) {
      console.warn(`[scrape:${jobId}] Stuck — no events for ${Math.round(idle / 1000)}s, cancelling`);
      cancelJob(jobId, "Job timed out — no progress for several minutes");
    }
  }, WATCHDOG_INTERVAL_MS);
}

function cancelJob(jobId, reason = "Cancelled by user") {
  const job = jobs.get(jobId);
  if (!job) return { error: "job not found" };
  if (job.status !== "running") return { error: "job not running", status: job.status };

  clearWatchdog(job);
  if (job.child && !job.child.killed) {
    job.child.kill("SIGTERM");
    setTimeout(() => {
      if (job.child && !job.child.killed) job.child.kill("SIGKILL");
    }, 5000);
  }

  job.status = "cancelled";
  job.error = reason;
  job.completedAt = Date.now();
  return { jobId, status: "cancelled" };
}

function startScrape(profile) {
  try {
    return startScrapeReal(profile);
  } catch (err) {
    return { error: err.message };
  }
}

function startScrapeReal(profile) {
  if (!env.BRIGHT_DATA_API_TOKEN) {
    throw new Error("BRIGHT_DATA_API_TOKEN is required — mock scrape is disabled");
  }

  const jobId = crypto.randomBytes(8).toString("hex");
  const job = {
    jobId,
    status: "running",
    profile,
    results: {},
    events: [],
    startedAt: Date.now(),
    lastEventAt: Date.now(),
    child: null,
    watchdogTimer: null,
    demoCacheEnabled: true,
  };
  jobs.set(jobId, job);
  runRealScrape(jobId);
  return { jobId, status: "running", demoCacheEnabled: true };
}

function runRealScrape(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  const scriptPath = path.join(__dirname, "../../scraper/run_job.py");
  const python = getPythonPath();
  const profileJson = JSON.stringify(job.profile || {});

  const child = spawn(
    python,
    [scriptPath, "--job-id", jobId, "--profile-json", profileJson, "--max-hospitals", String(process.env.SCRAPE_MAX_HOSPITALS || MAX_HOSPITALS)],
    {
      cwd: path.join(__dirname, "../../scraper"),
      env: {
        ...process.env,
        BRIGHTDATA_API_KEY: env.BRIGHT_DATA_API_TOKEN,
        BRIGHTDATA_SCRAPER_SYNC: "1",
        BRIGHTDATA_SYNC_TIMEOUT: "50",
        BRIGHTDATA_UNLOCKER_ZONE: env.BRIGHTDATA_UNLOCKER_ZONE,
        BRIGHTDATA_USE_UNLOCKER_ALL: "1",
        MRF_SAMPLE_MB: "40",
        PYTHONUNBUFFERED: "1",
      },
    }
  );

  job.child = child;
  startWatchdog(jobId);

  let buffer = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "event") {
          const { type, ...evt } = msg;
          job.events.push(evt);
          touchJob(job);
        } else if (msg.type === "complete") {
          job.status = msg.failed_count > 0 && msg.count === 0 ? "failed" : "complete";
          job.results = msg.results || {};
          job.failedHospitals = msg.failed_hospitals || [];
          job.completedAt = Date.now();
          job.stats = summarizeEvents(job.events);
          if (msg.failed_count > 0) {
            job.partial = true;
          }
          clearWatchdog(job);
        } else if (msg.type === "error") {
          job.status = "failed";
          job.error = msg.message;
          clearWatchdog(job);
        }
      } catch {
        /* ignore non-json stdout */
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    console.warn(`[scrape:${jobId}]`, chunk.toString().trim());
  });

  child.on("close", (code) => {
    const current = jobs.get(jobId);
    if (!current) return;
    clearWatchdog(current);
    if (current.status === "running") {
      if (code === 0) {
        current.status = Object.keys(current.results).length ? "complete" : "failed";
        if (!Object.keys(current.results).length) {
          current.error = current.error || "No hospitals returned price data";
        }
      } else {
        current.status = "failed";
        current.error = current.error || `Python scraper exited with code ${code}`;
      }
      current.completedAt = Date.now();
      current.stats = summarizeEvents(current.events);
    }
    current.child = null;
  });
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function getResults(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  const stats = job.stats || summarizeEvents(job.events ?? []);
  return {
    jobId,
    status: job.status,
    profile: job.profile,
    results: job.results,
    events: job.events ?? [],
    count: Object.keys(job.results).length,
    partial: job.partial ?? false,
    failedHospitals: job.failedHospitals ?? [],
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    elapsedMs: (job.completedAt || Date.now()) - job.startedAt,
    demoCacheEnabled: job.demoCacheEnabled ?? true,
    stats,
  };
}

function getEventsSince(jobId, since = 0) {
  const job = jobs.get(jobId);
  if (!job) return [];
  return job.events.slice(since);
}

module.exports = {
  startScrape,
  cancelJob,
  getJob,
  getResults,
  getEventsSince,
  AUSTIN_NODES,
  MAX_HOSPITALS,
};
