# Clearweb Health — Design workflow with Cursor

Use this workflow when polishing UI with AI agents in Cursor.

## Prerequisites

- Frontend running: `cd frontend && npm run dev`
- Backend running for full journey: `cd backend && npm run dev`

## Cursor Design Mode

1. Open the **Agents** browser panel to `http://localhost:3000`
2. Toggle **Design Mode**: `Cmd+Shift+D` ([docs](https://cursor.com/docs/agent/design-mode))
3. Walk the journey: onboarding → scrape → results

### High-value selections

| Select | Prompt |
|--------|--------|
| Scrape progress bar + timeline | "Match Header badge tokens; fix contrast" |
| Results tab bar + flashcards | "Linear-style tabs, no mono caps" |
| Voice shell | "Align with neutral surface tokens" |

### Multi-select

Shift+click scrape graph overlay + live feed + procedure chips → "Unify borders and typography to clearweb-design rule"

## Project rules

- [`.cursor/rules/clearweb-design.mdc`](../.cursor/rules/clearweb-design.mdc) — tokens, forbidden patterns, phase UX
- [`frontend/src/lib/design-tokens.ts`](../frontend/src/lib/design-tokens.ts) — import colors in components
- [`frontend/src/lib/brand.ts`](../frontend/src/lib/brand.ts) — product copy

## Reference products

When prompting, cite patterns not pixels:

- **Perplexity** — calm progress while "working"
- **Linear** — neutral pills, dense readable layout
- **Vercel logs** — human event timeline during deploy/scrape
- **GoodRx / Turquoise** — price as hero, map + list

## Canvas (optional)

For side-by-side mood boards before large rethemes, use the Cursor **canvas** skill to compare phase layouts. Canvases live in the project `canvases/` directory.

## Checklist before shipping UI changes

- [ ] No `#00FFBA` / green-on-green text
- [ ] Scrape phase: no SVG `scale` hover, parallax paused
- [ ] Results default tab: Map
- [ ] `prefers-reduced-motion` respected
- [ ] Trust line visible on results
