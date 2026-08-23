"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { env } = require("../config/env");

function getPythonPath() {
  if (env.SCRAPER_PYTHON) return env.SCRAPER_PYTHON;
  return path.join(__dirname, "../../scraper/.venv/bin/python");
}

function runCollectorStatus() {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "../../scraper/scripts/collector_status.py");
    const child = spawn(getPythonPath(), [script], {
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
      if (code !== 0) return reject(new Error(stderr || `collector_status exited ${code}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (err) {
        reject(new Error(`Invalid collector_status JSON: ${err.message}`));
      }
    });
  });
}

module.exports = { runCollectorStatus };
