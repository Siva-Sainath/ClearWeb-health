/**
 * Capture demo screenshots from localhost:3000
 * Usage: npx playwright install chromium && node scripts/demo-capture.mjs
 */

import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";

const BASE = process.env.DEMO_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/demo-clips/screenshots");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, "01-landing.png"), fullPage: true });

  // Wait for onboarding voice UI
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "02-onboarding.png"), fullPage: true });

  // Type fallback if available
  const typeBtn = page.getByRole("button", { name: /type|keyboard/i }).first();
  if (await typeBtn.isVisible().catch(() => false)) {
    await typeBtn.click();
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, "03-type-fallback.png"), fullPage: true });
  }

  await browser.close();
  console.log(`Screenshots saved to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
