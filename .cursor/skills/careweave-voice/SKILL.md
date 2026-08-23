---
name: careweave-voice
description: Clearweb Health voice agent, webcmd bridge, and Aria tag vocabulary. Use when working on useAriaAgent, TTS, onboarding voice flow, or webcmd integration.
---

# Clearweb Health Voice Agent

## Stack
- **STT:** Browser Web Speech API (live mic) → `POST /api/stt/transcribe` on the backend. Default cloud path is **Groq Whisper** (`whisper-large-v3-turbo`) when `STT_PROVIDER=groq` or `GROQ_API_KEY` is set (`STT_PROVIDER=auto`). Local Xenova Whisper is the offline fallback.
- **LLM (Aria backend):** `POST /api/agent/chat` via `backend/services/llmProvider.js`. **Default:** `LLM_PROVIDER=ollama` + local Ollama (`OLLAMA_MODEL=llama3.1:8b`). Optional: `openai` (`OPENAI_API_KEY`). `openrouter` exists in code but is **not** the working production path for Aria — OpenRouter/ox-alpha is for **Cursor IDE** agents (Cursor Settings), not the Node backend unless you explicitly wire and test it.
- **TTS:** **Groq Orpheus** (`canopylabs/orpheus-v1-english`, voice `hannah`) via `POST /api/tts/speak` when `TTS_PROVIDER=groq` and `GROQ_API_KEY` is set. Microsoft Edge TTS (`en-US-AriaNeural`) is the fallback only when Groq is unavailable.
- **UI:** `[action:...]` tags → DashboardContext; `[navigate:...]` → phase/panel/scroll/url

## Hosting (production)
**Groq powers voice, not the LLM:**
- **TTS + STT:** `GROQ_API_KEY`, `TTS_PROVIDER=groq`, `STT_PROVIDER=groq` (or `auto`)
- **LLM (Aria):** For a hosted demo you still need a backend LLM. Today that means **Ollama on a machine you control** (local/laptop demo) or **`LLM_PROVIDER=openai`** with a real `OPENAI_API_KEY`. Do **not** assume OpenRouter works for `/api/agent/chat` — it is not what we run in `backend/.env` today.
- **Cursor vs backend:** OpenRouter + `stealth/ox-alpha` in Cursor Settings is for the IDE agent only (see `.cursor/rules/openrouter-ox.mdc`). It does not automatically configure Aria.

### Typical local dev env (matches `backend/.env`)
```
GROQ_API_KEY=...
TTS_PROVIDER=groq
STT_PROVIDER=groq
OLLAMA_BASE=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
# LLM_PROVIDER unset → ollama
WEBCMD_BRIDGE_SECRET=...
```

## Phase rules
- **onboarding**: collect profile via `[profile:field:value]`; no prices
- **scraping**: mic disabled; no facility discussion
- **results**: discuss JSON facilities; always tag UI when referencing data

## Tag reference
- `[action:spotlight:n5][action:show_card:n5]`
- `[action:tab:scatter|range|compare|chat]`
- `[navigate:phase:scraping|results]`
- `[profile:condition:...]` `[profile:insurance:...]` `[profile:zipCode:...]`

## Autonomous brain (backend)

**Single entry:** `POST /api/scrape/session` → prices + replay events + heal context + ranked summary + explanation (+ agentic presentation plan).

| Endpoint | Purpose |
|----------|---------|
| `POST /api/scrape/session` | `{ profile, mode: auto\|cached\|live, instant?, agentic? }` |
| `GET /api/scrape/session/:id` | Poll live job → full brain payload when complete |

**Server modules:** `brainService.js` orchestrates `scrapeContext`, `executiveSummary`, `deterministicExplanation`, `resultsConductor`.

**Frontend:** `useScrapeJob` calls session API; `applyBrainSession()` loads context; `useResultsConductor` plays prebuilt `presentation` when agentic.

## Autonomous UI (how the agent moves the website)

Battle-tested pattern: **OpenAI-style tool calling** (Groq `llama-3.3-70b` when `GROQ_API_KEY` set) → structured `steps[]` with `delayMs` → browser orchestrator applies UI with framer-motion. Fallback: Ollama JSON plan or legacy `[action:...]` tag stream.

Three layers — same action vocabulary:

1. **In-browser (Aria chat):** `useAriaAgent` parses `[action:...]` from `/api/agent/chat` stream → `applyActions()` directly.
2. **Backend conductor:** `POST /api/agent/conduct-results` — Groq tools or JSON plan → `steps[]` with per-step `actions` → `usePresentationOrchestrator` staggers UI + TTS (no bulk webcmd dump).
3. **External (Gemini / Antigravity / MCP):** `scripts/mcp-ui-bridge.mjs` or `GET /api/page-state` + `POST /api/webcmd-action` → `WebcmdPollHandler` polls every 500ms.

**Frontend hooks:** `useResultsConductor` + `usePresentationOrchestrator`, `AppStateBridge`, `WebcmdPollHandler`.

**Tool schema:** `backend/services/uiToolSchema.js` — `set_layout`, `spotlight_facility`, `set_tab`, `reveal_facility`, `compare_facilities`, etc.

**Scrape management:** offload to Antigravity via `scraper/scripts/orchestrate_texas.py` (not the results UI).

## webcmd bridge
- `GET/POST /api/page-state` — full app snapshot
- `POST /api/webcmd-action` — inject UI actions (Bearer `WEBCMD_BRIDGE_SECRET`)
