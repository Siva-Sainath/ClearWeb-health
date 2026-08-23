---
name: careweave-voice
description: Clearweb Health voice agent, webcmd bridge, and Aria tag vocabulary. Use when working on useAriaAgent, TTS, onboarding voice flow, or webcmd integration.
---

# Clearweb Health Voice Agent

## Stack
- **STT:** Browser Web Speech API (live mic) → `POST /api/stt/transcribe` on the backend. Default cloud path is **Groq Whisper** (`whisper-large-v3-turbo`) when `STT_PROVIDER=groq` or `GROQ_API_KEY` is set (`STT_PROVIDER=auto`). Local Xenova Whisper is the offline fallback.
- **LLM:** `POST /api/agent/chat` via `backend/services/llmProvider.js`. **Production default:** `LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY` (e.g. `stealth/ox-alpha`). **Local dev fallback:** `LLM_PROVIDER=ollama` + local Ollama.
- **TTS:** **Groq Orpheus** (`canopylabs/orpheus-v1-english`, voice `hannah`) via `POST /api/tts/speak` when `TTS_PROVIDER=groq` and `GROQ_API_KEY` is set. Microsoft Edge TTS (`en-US-AriaNeural`) is the fallback only when Groq is unavailable.
- **UI:** `[action:...]` tags → DashboardContext; `[navigate:...]` → phase/panel/scroll/url

## Hosting (production)
Deployed demo does **not** need Ollama or local Whisper on the server:
- **TTS + STT:** Set `GROQ_API_KEY`, `TTS_PROVIDER=groq`, and `STT_PROVIDER=groq` (or `auto`) — Groq handles Orpheus TTS and Whisper STT from any host.
- **LLM:** Set `LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`, e.g. `stealth/ox-alpha`). Do not assume `OPENAI_API_KEY` unless you explicitly switch providers.
- **STT in browser:** Web Speech API still handles live mic when available; recorded/fallback audio goes to Groq Whisper on the backend.
- **Vapi** (`@vapi-ai/web` in package.json): optional future swap for a single vendor STT+LLM+TTS stack — not the current default.

### Minimal production env (see `backend/.env.example`)
```
GROQ_API_KEY=...
TTS_PROVIDER=groq
STT_PROVIDER=groq
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=...
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

## webcmd bridge
- `GET/POST /api/page-state` — full app snapshot
- `POST /api/webcmd-action` — inject UI actions (Bearer `WEBCMD_BRIDGE_SECRET`)
