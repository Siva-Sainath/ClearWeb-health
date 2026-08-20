# Clearweb Health — Full Demo Script (End to End)

One continuous shoot: **onboarding → instant results → Aria walkthrough → follow-ups → scrape replay → close.**

Record at **1920×1080**, dark mode, mic on. Hard refresh (`Cmd+Shift+R`) before you start.

---

## Services

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3001 |

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

---

## Before you start (30 sec)

1. Open http://localhost:3000 in a **fresh tab** (click logo to reset if needed).
2. **Allow microphone** when prompted.
3. Hide bookmarks bar; close noisy tabs.
4. Demo data: **Austin**, **78704**, **Aetna**, **ER visit** (CPT 99284) — 8 real hospital MRF prices pre-loaded.

**Optional cold open (voiceover only):**  
*"Hospital prices live in giant files online. Clearweb lets you talk to Aria, see real numbers, and the whole page reshapes while she explains."*

---

## Flow map

```
Landing
  → Onboarding (6 turns, voice)
  → Results INSTANT (no scrape wait)
  → Aria walkthrough (auto, ~90 sec)
  → Follow-up chips (3–5, you choose)
  → "Watch how we searched" (replay ~60–90 sec)
  → Close CTA
```

**On-camera time:** ~5–7 minutes.

---

## ACT 1 — Aria opens (15 sec)

**On screen:** Landing, mic pulses. Aria speaks after a brief “One moment…”

**Aria (approx):**  
*"Hey — I'm Aria. Tell me what you're trying to get priced — like a colonoscopy, MRI, or ER visit — and I'll hunt down real hospital prices for you."*

**You:** Tap mic (or it auto-starts). Wait until she finishes, then begin onboarding.

---

## ACT 2 — Onboarding script (60–90 sec)

Say **one line per turn**. Tap mic → speak → tap again to send (or hold ~2 sec).  
Watch **profile bubbles** fill in the corners; they **update** if Aria corrects you (e.g. “atna” → **Aetna**). City and ZIP are **separate bubbles**.

| Turn | You say | What should happen |
|------|---------|-------------------|
| **1** | *"I need to know what an ER visit would cost — my last bill was insane."* | Procedure bubble: ER visit. Aria asks insurance. |
| **2** | *"Aetna."* (or say “atna” — bubble should correct to **Aetna**) | Insurance bubble: Aetna. Aria asks **city**. |
| **3** | *"Austin."* | **City** bubble: Austin. Aria asks ZIP. |
| **4** | *"78704."* | **ZIP** bubble: 78704 (not the city name). Aria asks distance / priorities. |
| **5** | *"25 miles is fine. I just want the cheapest decent option."* | Radius + cost priority. Aria asks to confirm. |
| **6** | *"Yeah, go ahead."* or *"Start searching."* | **No scrape wait** — jumps straight to **results** with pre-collected Austin data. |

**Aria on confirm (approx):**  
*"We already pulled real hospital price files near Austin — 8 places with prices for your ER visit. I'll walk you through your options…"*

### Type fallback (same script)

If mic fails: open keyboard, paste **one line at a time**, submit after each.

---

## ACT 3 — Results + Aria walkthrough (90–120 sec)

**Do not interrupt.** Walkthrough starts automatically.

**On screen (in order):**

1. **Header** — procedure · Aetna · Austin · 78704 · 25 mi  
2. **Info card** — “Prices from a recent hospital scrape”  
3. **Inline caption** while Aria speaks (no floating ribbon over the title)  
4. **Walkthrough cards** appear as she talks:
   - **Your price range** — min/max on Aetna, savings callout  
   - **How we collected prices** — Bright Data Scraper Studio, Web Unlocker, cache vs live, self-healing  
   - **What we searched** — ER visit in Austin, 78704, 25 mi  
   - **Top pick** — hero card + map spotlight  
   - **Second option** — second facility reveal  
5. **Ranked cards** appear as each facility is discussed.

**Optional voiceover while she talks:**  
*"Watch the layout — savings story, then how we crawled hospital sites with Bright Data, then her top picks on the map."*

**When walkthrough ends:** Follow-up chips unlock at the bottom.

---

## ACT 4 — Follow-up script (90–120 sec)

Use **chips** or **voice** (same phrases). Pause after each so UI + TTS finish.

### Follow-up 1 — Cheapest on a chart (~20 sec)

**Tap chip or say:** *"Show me the cheapest on a chart."*

**On screen:** Full-width **chart focus**, scatter tab, cheap filter, cheapest hospital highlighted.

**Aria (approx):** *"Here's the cheapest on the chart — [hospital] at about $[price]."*

---

### Follow-up 2 — Compare top two (~25 sec)

**Tap chip or say:** *"Compare my top two."*

**On screen:** **Compare split** — side-by-side top two, compare tab.

**Aria (approx):** *"Side by side — [hospital A] at about $X, and [hospital B] at about $Y."*

---

### Follow-up 3 — Map (~20 sec)

**Tap chip or say:** *"Put it on the map."*

**On screen:** **Map route** layout, top pick routed/highlighted.

**Aria (approx):** *"On the map — [hospital] is about [N] miles from you."*

---

### Optional follow-ups (pick any)

| Chip / you say | On screen |
|----------------|-----------|
| **Help me book the top one** | Spotlight hero, booking link or call card |
| **Accredited hospitals only** | Accredited filter, range tab |
| **What didn't work?** | Trust / gaps panel (sites with no public prices) |
| *"How much could I save?"* | Savings story + range chart |
| *"Who's closest?"* | Sort by distance, scatter |
| *"Compare price versus distance"* | Chart focus scatter |
| *"Tell me about your top pick again"* | Hero + card reveal |
| *"Show me everything again"* | Reset to explore layout |

**Tip for video:** Do **three** follow-ups on camera (chart → compare → map), then one optional (*What didn't work?* or *Help me book*) if you have time.

---

## ACT 5 — Scrape replay (60–90 sec)

**You (to camera):**  
*"You saw the prices instantly — now here's how we actually got them."*

**On screen:**

1. On results, find the card: **"Prices from a recent hospital scrape"**
2. Click **`Watch how we searched`** (not “Run live scrape now” on camera unless B-roll).

**Replay opens — point at these beats:**

| Moment | What to say (optional) |
|--------|-------------------------|
| Violet **Replay** banner | *"This is a fast-forward of a real scrape session — not a cartoon."* |
| **8 hospital websites** on the radial map (St. David's, BSW, Ascension, etc.) | *"One node per hospital **website** — our collectors hit each price-transparency portal."* |
| Green strand → a site | *"Bright Data Scraper Studio finds the CMS machine-readable file link."* |
| **Cached** event in log | *"Some MRF files we already had on disk — still real published hospital data."* |
| **Live download** in log | *"Others we pull live through Web Unlocker through bot protection."* |
| Red pulse on a node | *"When a site breaks or throttles us, you see the failure — we don't hide it."* |
| Blue heal ring + floating label | *"Self-healing kicks in — new collector tier or Web Unlocker retry."* |
| Green complete + price in log | *"We parse negotiated rates for your plan and procedure code."* |
| Progress: **X of 8 hospital websites** | *"Eight unique sites, not duplicate labels."* |
| **Search complete** overlay | *"Replay finishes — back to your ranked options."* |

**Auto:** Returns to **results** after ~60–90 seconds (8× speed).

**Skip on main video:** **`Run live scrape now`** — 5–15 min, use only for separate B-roll.

---

## ACT 6 — Close (15–30 sec)

**On screen:** Ranked cards or tap **Help me book the top one**.

**You:**  
*"Real hospital transparency data — voice-first, layout that moves with you, and you can replay exactly how we crawled each site. That's Clearweb Health."*

---

## Full script — one page (read-through)

```
[OPEN]
"Hospital prices are hidden in giant files. Clearweb + Aria — talk, see real prices, UI moves with her."

[ARIA GREETING — listen]

1. "I need to know what an ER visit would cost — my last bill was insane."
2. "Aetna."
3. "Austin."
4. "78704."
5. "25 miles is fine. I just want the cheapest decent option."
6. "Yeah, go ahead."

[WALKTHROUGH — don't talk, optional whisper: "watch the layout shift"]

[FOLLOW-UPS]
"Show me the cheapest on a chart."
"Compare my top two."
"Put it on the map."
(Optional: "What didn't work?")

[REPLAY]
"Now watch how we searched — real Bright Data collectors, cache and live downloads, failures and heals."
→ Click "Watch how we searched"
→ Narrate map: 8 websites, cache, live, red fail, blue heal, green price
→ Wait for "Search complete"

[CLOSE]
"Real MRF pricing, voice-first, full transparency on how we got it. Clearweb Health."
```

---

## What’s under the hood (if you narrate tech)

| Layer | Role |
|-------|------|
| **Voice** | Browser STT + Edge TTS; Aria via Ollama |
| **UI** | Layout modes driven by invisible action tags |
| **Data** | CMS machine-readable files (MRF), parsed for your CPT + payer |
| **Bright Data** | Scraper Studio (navigate portals) + Web Unlocker (download MRF bytes) |
| **Cache** | Disk MRF cache for fast demo; prices still from real files |
| **Replay** | Curated events from real scrape logs (`austinDemoSnapshot.json`) |

---

## Config

| Variable | Default | Effect |
|----------|---------|--------|
| `NEXT_PUBLIC_DEMO_INSTANT_RESULTS` | unset / `true` | Instant results on confirm |
| `false` | | Live scrape on confirm instead of instant |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Aria laggy at start | Hard refresh; ensure backend up on 3001 |
| "Atna" stuck on bubble | Hard refresh — normalization should fix to Aetna when Aria confirms |
| City in ZIP bubble | Say ZIP as digits; city in separate turn |
| Walkthrough overlaps header | Ribbon hidden during walkthrough — use inline caption |
| Replay shows duplicates | Should show **8 websites** — refresh if you still see 17 truncated labels |
| Mic fails | Type fallback, same six lines |

---

## Shoot checklist

- [ ] Backend + frontend running  
- [ ] Mic allowed  
- [ ] Hard refresh  
- [ ] Six onboarding lines memorized  
- [ ] Three follow-ups: chart → compare → map  
- [ ] **Watch how we searched** clicked (not live scrape)  
- [ ] Close line ready  

**Total:** ~5–7 min one take, or ~4–6 min if you skip optional follow-up.
