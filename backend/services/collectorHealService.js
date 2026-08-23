"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { env } = require("../config/env");

function getPythonPath() {
  if (env.SCRAPER_PYTHON) return env.SCRAPER_PYTHON;
  return path.join(__dirname, "../../scraper/.venv/bin/python");
}

/**
 * Trigger Bright Data self-heal on a collector via scraper/pipeline/heal.py.
 * Used for judge demos and optional brain-initiated recovery.
 */
function runCollectorHeal({
  collectorId,
  reason,
  seedUrl = "",
  slug = "",
  name = "",
  domain = "",
  tier = 1,
  rerun = true,
}) {
  return new Promise((resolve, reject) => {
    if (!collectorId || !reason) {
      return reject(new Error("collectorId and reason are required"));
    }

    const script = path.join(__dirname, "../../scraper/scripts/heal_collector_api.py");
    const args = [
      script,
      collectorId,
      "--reason",
      reason,
      "--tier",
      String(tier),
    ];
    if (seedUrl) args.push("--seed-url", seedUrl);
    if (slug) args.push("--slug", slug);
    if (name) args.push("--name", name);
    if (domain) args.push("--domain", domain);
    if (rerun) args.push("--rerun");

    const child = spawn(getPythonPath(), args, {
      cwd: path.join(__dirname, "../../scraper"),
      env: {
        ...process.env,
        BRIGHTDATA_API_KEY: env.BRIGHT_DATA_API_TOKEN || process.env.BRIGHTDATA_API_KEY,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      const line = stdout.trim().split("\n").filter(Boolean).pop() || "";
      try {
        const data = JSON.parse(line);
        if (code !== 0 && data.error) return reject(new Error(data.error));
        return resolve(data);
      } catch {
        reject(new Error(stderr || stdout || `heal_collector_api exited ${code}`));
      }
    });
  });
}

module.exports = { runCollectorHeal };
