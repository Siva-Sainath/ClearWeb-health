# Clearweb Health — 2-minute demo loop (live)

**Before you start:** Open `http://localhost:3000` (or deploy) ~2 min early so TTS warms up. Mic on. Use **78701** + **Aetna**.

**Best procedure for this build:** **lumbar MRI (CPT 72148)** — densest Austin cache (12 hospitals) + full proof-reel.

**Alternate (matches committed snapshot replay exactly):** ER visit **CPT 99284**, ZIP **78704**.

---

## Timing map (~2:00 total)

| Time | Phase | You do / say | Aria / UI does |
|------|--------|----------------|----------------|
| **0:00–0:35** | Onboarding | See script below | Collects profile → auto-navigates to scrape |
| **0:35–1:15** | Proof-reel | Point at map + one heal beat | Past-tense replay, 8× speed, self-heal overlay |
| **1:15–1:50** | Results | One follow-up chip (below) | Range → trust → top hospital → compare → map |
| **1:50–2:00** | Act 2 heal | Open St. Luke’s showcase | Houston recorded heal (not Austin prices) |

---

## Onboarding script (~35 sec)

Say this in one natural breath (Aria fills fields from voice):

> “I need a **lumbar MRI** near **Austin**. I'm on **Aetna**. My ZIP is **78701**. Search within **25 miles**.”

**While Aria talks back:** glance at the right panel — you should see procedure, insurance, city, ZIP filling in.

**Do not** click “pull prices” — when all five fields are set, Aria triggers the scrape herself.

**If she asks anything else:** answer with the same facts; don’t change ZIP to Houston/Dallas (no cache).

---

## Proof-reel (~40 sec) — when to show self-heal

**Let the reel run.** Don’t skip unless you’re out of time.

**Point at (10 sec):**
- Map spokes = hospital transparency sites (Scraper Studio)
- Banner: *recorded replay*, not live

**Self-heal moment (~15 sec) — Austin replay:**
- When the timeline **slows** and the **self-heal overlay** appears (often St. David’s in the Austin reel), say:
  > “The collector broke on this site — Bright Data self-healing repaired it while we watched. No manual code fix.”

**Do not** narrate every hospital name — the new script speaks ~4 lines total.

**Outro line (~5 sec):** Aria gives price range, then moves to results automatically.

---

## Results (~35 sec) — follow-ups to ask

Let the **deterministic walkthrough** autoplay first (range → collection/heal story → top pick → compare → map).

**Pick ONE chip or voice line** (only if you need to show agency):

| When | Say / tap | What judges should see |
|------|-----------|-------------------------|
| After range step | “**What didn’t work?**” or “Show trust gaps” | `trustGaps` layout — collector IDs, cache vs live |
| After trust step | Tap **“Play the recorded heal cycle”** in trust panel | Inline `SelfHealCinematic` (Houston St. Luke’s recording) |
| After top hospital | “**Compare my top two**” | Split compare with real `$` |
| Closing | “**Put it on the map**” | Map tab, facilities plotted |

**One honest line if asked about data:**
> “These dollars are from **real CMS machine-readable files** in our cache — replay is recorded events at 8×; we don’t invent prices.”

---

## Act 2 — St. Luke’s BD self-heal (~10 sec)

**When:** Last 10 seconds, or right after trust panel if you skipped chips.

**How:** Results page → trust panel → **“Open full showcase”** OR go to **`/showcase/heal`**.

**Say:**
> “This is a **separate recorded heal** on **St. Luke’s Houston** — collector `c_mt5goll71eekdhe91q`. Bright Data refactored the template; we show when the preview gate fails. **Not** Austin 78701 prices.”

---

## If something breaks (10-sec recovery)

| Problem | Recovery |
|---------|----------|
| Silent voice | Click once on page (unlock audio), refresh |
| Stuck onboarding | Say ZIP **78701** again clearly (not a 5-digit CPT) |
| No results | Use lumbar MRI + 78701; avoid Houston ZIPs |
| Robotic voice on first line | Wait 2 sec — scripted lines use cached Edge TTS after boot |

---

## One-line pitch (optional opener before onboarding)

> “Clearweb Health is a voice agent that scrapes hospital price-transparency sites with Bright Data, shows you real negotiated rates, and walks the dashboard while it explains.”
