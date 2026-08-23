# Clearweb Health — UI Flow, Architecture & Frontier UX Research Brief

> **Purpose:** Feed this document to a research LLM to discover frontier UI/UX methods, libraries, animation patterns, and implementation strategies for elevating Clearweb Health from a functional hackathon app to a visually stunning autonomous healthcare price navigator.

---

## 1. Product summary

**Clearweb Health** is a voice-first web app that:
1. Onboards a patient via spoken conversation (procedure, insurance, city, ZIP, radius)
2. Scrapes or replays hospital price transparency data (Bright Data collectors + MRF files)
3. Presents ranked hospital options with an **autonomous AI agent (Aria)** that explains results while **reshaping the dashboard** in real time

**Not a script demo:** The agent uses LLM tool-calling (Groq/Ollama), structured scrape context, staggered UI orchestration, and honest narration of cache vs live vs replay data sources.

---

## 2. End-to-end user flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ ONBOARDING  │ ──► │   SCRAPING   │ ──► │   RESULTS   │ ──► │  FOLLOW-UP   │
│ Voice + mic │     │ Replay/live  │     │ Agent walks │     │ Chat + chips │
│ Profile tags│     │ ScrapeCanvas │     │ UI reshapes │     │ Map/charts   │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

### Phase 1: Onboarding (`journeyPhase: "onboarding"`)

| Component | Role |
|-----------|------|
| `VoiceOnboardingView.tsx` | Main onboarding shell |
| `InteractionStage.tsx` | Avatar, caption, voice ring |
| `ProfileFieldBubbles.tsx` | Animated profile chips from `[profile:...]` tags |
| `useAriaAgent.ts` | Streams `/api/agent/chat`, parses action/profile tags |
| `useWebSpeechRecognition.ts` | Browser mic → backend Groq Whisper STT |

**Agent behavior:** Short spoken turns; collects procedure, insurance, city, ZIP, radius via `[profile:field:value]` tags. On confirm → `[navigate:phase:scraping]`.

### Phase 2: Scraping (`journeyPhase: "scraping"`)

| Component | Role |
|-----------|------|
| `ScrapeCanvas.tsx` | Full-screen spider-web visualization of hospital nodes |
| `useScrapeTimeline.ts` | Reduces scrape events → node states (idle/active/healing/broken/complete) |
| `useScrapeOrchestrator.ts` | Coordinates replay speed (8×), completion → results transition |
| `useScrapeNarration.ts` | Optional TTS lines during heal/failure events |
| `useScrapeJob.ts` | Calls `POST /api/scrape/session` — brain loads data in parallel |

**Presentation modes:**
- `proof-reel` — Cached ZIP hit: real replay events at 8× speed + prices already loaded
- `live` — Bright Data scrape in progress (SSE events)
- `instant` — Skip animation (avoid for autonomous testing)

**Visual:** SVG spider diagram — center hub (patient), strands to hospital nodes, crawler dot animation, heal pulses, cache vs live badges.

### Phase 3: Results (`journeyPhase: "results"`)

| Component | Role |
|-----------|------|
| `ResultsView.tsx` | Orchestrates voice shell + layout + cards + chat drawer |
| `ResultsLayoutShell.tsx` | Dynamic layout modes via `AnimatePresence` |
| `useResultsConductor.ts` | Plays backend `presentation.steps[]` with delays + TTS |
| `usePresentationOrchestrator.ts` | Staggered tool-call UI execution |
| `DashboardContext` | `applyActions()` — layout, spotlight, tab, reveal, compare |
| `ExplanationStage.tsx` | Section-by-section deterministic walkthrough (non-agentic path) |

**Layout modes** (`layout` UI action): `explore`, `chartFocus`, `compareSplit`, `mapRoute`, `spotlightHero`, `savingsStory`, `trustGaps`

**Charts:** ECharts — `PriceBubbleChart`, `PriceWaterfallChart`, `RadarCompareChart`  
**Map:** Leaflet + `react-leaflet`, driving routes via `useDrivingRoute`

### Phase 4: Follow-up

- Collapsible chat in `ResultsView`
- `SuggestionChips` → intent routing (`followUpIntents.ts`)
- Aria continues streaming with `[action:...]` tags

---

## 3. Autonomous backend brain (single API)

**Entry:** `POST /api/scrape/session`

```json
{
  "profile": { "procedure", "insurance", "city", "zipCode", "radiusMi", "priorities" },
  "mode": "auto|cached|live|instant",
  "agentic": true
}
```

**Returns:** `results`, `replayEvents`, `scrapeContext`, `executiveSummary`, `explanation`, `presentation` (tool steps for UI)

| Module | Path |
|--------|------|
| Brain orchestrator | `backend/services/brainService.js` |
| Scrape honesty context | `backend/services/scrapeContext.js` |
| Ranking | `backend/services/executiveSummary.js` |
| Instant explain | `backend/services/deterministicExplanation.js` |
| Agentic walkthrough | `backend/services/resultsConductor.js` + Groq tool calling |
| UI tool schema | `backend/services/uiToolSchema.js` |

**LLM stack:** Groq (STT/TTS/presentation), Ollama fallback (chat), OpenAI-compatible tool API.

**Agent ↔ UI bridge:**
1. In-browser: tag parse → `applyActions()`
2. Session presentation: staggered steps from backend
3. External: `webcmd` poll + MCP bridge (`scripts/mcp-ui-bridge.mjs`)

---

## 4. Current UI tech stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16.3 |
| UI library | React | 19.2 |
| Styling | Tailwind CSS v4 + CSS variables | 4.x |
| Animation | Framer Motion | 13.1 |
| Charts | ECharts + echarts-for-react | 6.1 |
| Maps | Leaflet + react-leaflet | 1.9 / 5.0 |
| Primitives | Radix UI (tabs, dialog, slider, tooltip) | 1.x |
| Gestures | @use-gesture/react | 10.3 |
| Drawer | Vaul | 1.1 |
| Icons | lucide-react | 1.32 |
| Voice (unused in prod path) | @vapi-ai/web | 2.6 |

**Typography:** Inter (sans), Fraunces (serif headlines), IBM Plex Mono  
**Design tokens:** `frontend/src/lib/design-tokens.ts` — charcoal void `#0a0a0b`, emerald accent `#34d399`  
**Utilities:** `.glass`, `.glass-accent`, `.gradient-text` in `globals.css`

---

## 5. UI component inventory (audit)

### Voice / agent chrome
- `VoiceShell.tsx`, `VoiceRing.tsx`, `VoiceWave.tsx`, `AvatarPresenter.tsx`
- `AgentLiveRibbon.tsx`, `AgentActionBar.tsx`

### Onboarding
- `VoiceOnboardingView.tsx`, `OnboardingProgress.tsx`, `LiveProfilePanel.tsx`
- `MergedProfileChip.tsx`

### Scrape visualization
- `ScrapeCanvas.tsx` — **primary cinematic surface** (SVG web, 700+ lines)
- `ScrapeTrustPanel.tsx`, `ScrapeDemoActions.tsx`

### Results / data viz
- `ResultsView.tsx` — **largest orchestrator** (~640 lines)
- `ResultsLayoutShell.tsx`, `ResultsTabShell.tsx`
- `ConsumerOptionCard.tsx`, `ProviderHero.tsx`, `SavingsCallout.tsx`
- `CompareSplitView.tsx`, `ExecutiveSummaryPanel.tsx`
- `FacilityFlashcards.tsx`, `FacilityMap.tsx`
- `ExplanationStage.tsx`

### Ambient
- `WebBackground.tsx`, `Header.tsx`

### State
- `AppContext.tsx` — journey, profile, scrape, brain session
- `DashboardContext.tsx` — layout, spotlight, filter, sort, compare

---

## 6. Animation & motion patterns (current)

| Pattern | Where | Library |
|---------|-------|---------|
| Phase transitions | `PatientView` AnimatePresence | Framer Motion |
| Layout mode morph | `ResultsLayoutShell` popLayout | Framer Motion |
| Card reveal | `ConsumerOptionCard`, `ExplanationStage` | Framer Motion |
| Presentation pulse | `ResultsView` motion.div key on layout step | Framer Motion |
| Scrape crawler dot | `ScrapeCanvas` CrawlerDot | Framer Motion SVG |
| Node heal pulse | `ScrapeCanvas` | CSS + motion |
| Profile bubble fly-in | `ProfileFieldBubbles` | Framer Motion |
| Reduced motion | `useReducedMotion.ts` | respects `prefers-reduced-motion` |

**Gaps (opportunities):**
- No shared motion design system / variant presets
- No page-level scroll-driven storytelling (GSAP ScrollTrigger, Lenis)
- No WebGL / shader backgrounds (Three.js, R3F)
- No Lottie/Rive for micro-illustrations
- No video layers or generative backgrounds
- Charts animate on mount but not choreographed with agent steps
- Scrape replay timeline not synced to agent narration beats

---

## 7. Data available for UI testing (no script demo)

### Austin cache (recommended test ZIP)

Use voice onboarding or prefill profile:

```json
{
  "procedure": "Brain MRI",
  "condition": "Brain MRI",
  "insurance": "Aetna",
  "city": "Austin",
  "zipCode": "78701",
  "radiusMi": 25,
  "priorities": ["cost"]
}
```

- **12 facilities** in SQLite cache for this query
- **14 replay events** in `scraper/data/last_scrape_events.json` (or `frontend/src/data/austinDemoSnapshot.json`)
- Triggers `proof-reel` mode: animation + autonomous brain session

### Houston (live scrape — currently failing collectors)

ZIP `77030` — no cache; routes to live BD scrape (collectors failing; use for honest failure UI only).

### Verify data before UI test

```bash
# Cache check
curl "http://localhost:3001/api/prices/cache-check?zip=78701&radius=25"

# Full brain session (what the UI loads)
curl -X POST http://localhost:3001/api/scrape/session \
  -H "Content-Type: application/json" \
  -d '{"profile":{"zipCode":"78701","procedure":"Brain MRI","insurance":"Aetna","city":"Austin","radiusMi":25,"priorities":["cost"]},"mode":"cached","agentic":true}'
```

---

## 8. UI test note (for implementers)

Use Austin ZIP **78701** with the autonomous brain session (`POST /api/scrape/session`). Avoid `NEXT_PUBLIC_SKIP_ONBOARDING`, `NEXT_PUBLIC_DEMO_INSTANT_RESULTS`, and `NEXT_PUBLIC_SKIP_SCRAPE_ANIMATION` — those bypass the real voice + replay flow. Collector/scrape pipeline status: `GET /api/collectors/status`.

---

## 9. Research prompts for frontier UX LLM

Copy these when feeding this doc to a research agent:

### A. Generative UI / agent-driven layouts
> Research 2025–2026 frontier patterns for **LLM-controlled dashboards**: CopilotKit AG-UI, Vercel AI SDK `toolInvocations` + generative UI, JSON Render, Thesys C1, Motia stream UI. How do they choreograph layout morphs synchronized with streaming narration? Provide React implementation sketches for our `layout` modes (`explore`, `chartFocus`, `mapRoute`, etc.).

### B. Cinematic healthcare data storytelling
> Research visual storytelling for **price transparency** and **medical cost comparison** UIs. Examples: Bloomberg graphics, NYT interactive, Stripe press demos, Apple Health presentation patterns. How to show price range → facility reveal → map route as a **single continuous motion narrative** without feeling like a slideshow?

### C. Animation stack upgrade
> Compare **Framer Motion 13** vs **Motion One** vs **GSAP** vs **React Spring** for:
> - Layout-shared element transitions between chart/map/card heroes
> - SVG path animations (our scrape spider web)
> - Staggered orchestration from async LLM step arrays  
> Recommend one primary + one for scroll/cinematic sequences.

### D. WebGL / video / ambient layers
> Research lightweight **React Three Fiber** or **shader backgrounds** that work on mobile Safari without killing voice latency. Alternatives: Unicorn Studio embeds, grain overlays, WebCodecs for procedural video. How to add depth behind `.glass` surfaces without hurting LCP?

### E. Voice + UI coupling
> Research **multimodal presentation** UX: headliner products where TTS and UI morph are beat-synced (Duolingo, Voiceflow, ChatGPT Advanced Voice). Patterns for caption placement, barge-in, and highlighting the UI element being discussed.

### F. Chart choreography
> Research **ECharts** vs **Observable Plot** vs **D3** vs **Visx** for animated transitions when agent changes `tab:scatter` → `tab:range`. How to morph scatter → waterfall without chart remount flash?

### G. Accessibility + reduced motion
> Best practices for `prefers-reduced-motion` with agentic UI — alternative static layouts, instant reveals, transcript-first mode.

### H. Performance budget
> Target: voice round-trip <800ms, presentation step <100ms UI apply. Research code-splitting, `startTransition`, offscreen chart rendering, and TTS prefetch patterns.

---

## 10. Implementation priority matrix (suggested)

| Priority | Enhancement | Effort | Impact |
|----------|-------------|--------|--------|
| P0 | Sync scrape replay beats ↔ agent narration timeline | Medium | High — “cinematic honesty” |
| P0 | Shared motion tokens (durations, easings, stagger) | Low | High — cohesion |
| P1 | Layout shared-element transitions (hero ↔ card ↔ map) | Medium | High |
| P1 | Chart morph on agent tab/layout change | Medium | High |
| P2 | Ambient WebGL grain / particle field behind scrape web | Medium | Medium |
| P2 | Rive/Lottie for heal/failure micro-animations | Low | Medium |
| P3 | Scroll-driven results story (desktop) | High | Medium |
| P3 | Video texture backgrounds for “live scrape” mode | High | Low |

---

## 11. Key file paths (for implementers)

```
frontend/src/components/PatientView.tsx      # Phase router
frontend/src/components/ScrapeCanvas.tsx       # Scrape viz
frontend/src/components/ResultsView.tsx        # Results orchestrator
frontend/src/hooks/useScrapeJob.ts             # Session API client
frontend/src/hooks/useResultsConductor.ts      # Agentic presentation
frontend/src/context/DashboardContext.tsx      # UI action reducer
frontend/src/lib/design-tokens.ts              # Colors
frontend/src/app/globals.css                   # Glass, gradients

backend/services/brainService.js               # Unified brain
backend/services/scrapeContext.js              # Replay narrative
backend/services/resultsConductor.js           # Tool presentation

scraper/data/last_scrape_events.json           # Replay source
frontend/src/data/austinDemoSnapshot.json      # Demo fallback
```

---

## 12. Current UI strengths

- Coherent dark emerald aesthetic with glass surfaces
- Real autonomous brain session (not fake loading bars)
- Honest scrape context (cache vs live vs heal)
- Voice-first onboarding with profile visualization
- Dynamic layout modes driven by agent tools
- Proof-reel with real event log data

## 13. Current UI weaknesses

- Visual hierarchy flat on results — everything “glass card” sameness
- Scrape canvas and results feel like two different apps (style discontinuity)
- No shared-element continuity between scrape node → facility card
- Charts feel bolted on vs integrated into narrative
- Typography scale good at hero, weak in data-dense areas
- No loading skeletons / optimistic UI for brain session
- Mobile: scrape SVG dense; results tabs cramped
- Agent captions compete with layout for attention

---

*Generated for Clearweb Health / Scrape-Verse — autonomous UI research handoff.*
