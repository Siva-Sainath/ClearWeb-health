---
name: careweave-voice
description: Clearweb Health voice agent, webcmd bridge, and Aria tag vocabulary. Use when working on useAriaAgent, TTS, onboarding voice flow, or webcmd integration.
---

# Clearweb Health Voice Agent

## Stack
- STT: Web Speech API (browser) + Whisper fallback via `POST /api/stt/transcribe`
- LLM: `LLM_PROVIDER=ollama` (local) or `openai` (hosted production) via `POST /api/agent/chat`
- TTS: Groq Orpheus (`canopylabs/orpheus-v1-english`, voice `hannah`) via `POST /api/tts/speak` when `GROQ_API_KEY` is set; Edge TTS `en-US-AriaNeural` as fallback
- UI: `[action:...]` tags → DashboardContext; `[navigate:...]` → phase/panel/scroll/url

## Hosting (production)
Your laptop does **not** need to run Ollama or Whisper for a deployed demo:
- **TTS** already uses Microsoft's Edge TTS cloud — works from any server.
- **LLM** set `LLM_PROVIDER=openai` + `OPENAI_API_KEY` on your hosted backend.
- **STT** browser Web Speech handles live mic; recorded audio falls back to server Whisper.
- **Vapi** (`@vapi-ai/web` already in package.json) can replace the full voice stack later if you want one vendor for STT+LLM+TTS phone-quality voice — swap `useAriaAgent` for a Vapi assistant when ready.

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
