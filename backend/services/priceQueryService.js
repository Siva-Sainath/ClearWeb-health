"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { env } = require("../config/env");

function getPythonPath() {
  if (env.SCRAPER_PYTHON) return env.SCRAPER_PYTHON;
  return path.join(__dirname, "../../scraper/.venv/bin/python");
}

/**
 * Query cached SQLite prices + replay events for proof-reel mode.
 */
function queryCachedPrices({ zip = "", procedure = "", insurance = "", cpt = "", check = false, radius = 25 } = {}) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "../../scraper/query_prices.py");
    const args = [
      script,
      "--zip",
      zip || "78701",
      "--procedure",
      procedure || "",
      "--insurance",
      insurance || "",
      "--cpt",
      cpt || "",
      "--radius",
      String(radius),
    ];
    if (check) args.push("--check");

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
      if (code !== 0) {
        return reject(new Error(stderr || `query_prices exited ${code}`));
      }
      try {
        const line = stdout.trim().split("\n").pop();
        resolve(JSON.parse(line || "{}"));
      } catch (err) {
        reject(new Error(`Invalid query_prices JSON: ${err.message}`));
      }
    });
  });
}

module.exports = { queryCachedPrices };
