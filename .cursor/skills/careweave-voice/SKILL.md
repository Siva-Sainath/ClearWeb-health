---
name: careweave-voice
description: Clearweb Health voice agent, webcmd bridge, and Aria tag vocabulary. Use when working on useAriaAgent, TTS, onboarding voice flow, or webcmd integration.
---

# Clearweb Health Voice Agent

## Stack
- STT: Web Speech API (browser)
- LLM: Ollama via `POST /api/agent/chat` with `phase`: onboarding | scraping | results
- TTS: Edge TTS `en-US-JennyNeural` via `POST /api/tts/speak`
- UI: `[action:...]` tags → DashboardContext; `[navigate:...]` → phase/panel/scroll/url

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
