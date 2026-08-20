# Clearweb Health — Code Quality Rules

These rules apply to all code written or edited in this project.

## Architecture

- **No files over 150 lines** — split large components into focused sub-components.
- **Hooks in `/src/hooks/`** — all stateful logic (data fetching, timers, event streams) must live in a custom hook, never inline in a component.
- **Constants in `/src/lib/constants.ts`** — all magic values (colors, timing, node positions, API keys) must be named exports from this file.
- **Types in `/src/lib/types.ts`** — shared interfaces and type aliases must be centralized, not re-declared per file.
- **One default export per file** — no barrel re-exports of multiple components from one file.

## Naming

- Components: `PascalCase` (e.g. `ScrapeCanvas`, `VoiceOrb`)
- Hooks: `camelCase` prefixed with `use` (e.g. `useVapiMock`, `useAgentStream`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g. `NEXUS_CX`, `SPRING_STIFF`)
- CSS class utilities: prefer `.glass`, `.glow-crimson` utility classes over long inline `className` strings
- Files: match the exported identifier exactly (e.g. `ScrapeCanvas.tsx` exports `ScrapeCanvas`)

## Style & Formatting

- **Prettier** enforces all formatting. Run `npm run format` before committing.
- **No hardcoded hex colors in JSX** — always use CSS variable tokens (`var(--color-crimson)`) or the named constants from `lib/constants.ts`.
- **No inline `style={{}}` props** unless absolutely required for dynamic Framer Motion values. Use `className` + CSS variables otherwise.
- **No `as any` type casts** unless Framer Motion motion values require it — add a `// framer-motion: mixed style props` comment when used.

## Components

- Every exported component must have a **JSDoc comment** above it describing its purpose and props.
- **AnimatePresence** must wrap every conditional render that appears/disappears.
- **Spring transitions only** for avatar/physics animations. `ease: "linear"` is only allowed for rotating rings.
- Dead/stale components must be **deleted**, not commented out.

## Dead Code

The following files from old iterations are stale and must be deleted before submission:
- `src/components/AgentView.tsx`
- `src/components/ComparisonTable.tsx`
- `src/components/ConsoleLog.tsx`
- `src/components/GuideAvatar.tsx`
- `src/components/ProcedureSearch.tsx`
- `src/components/ScrapeVerseCanvas.tsx`
- `src/components/SpatialResultsUI.tsx`
- `src/components/SourceGraph.tsx`
- `src/components/VoiceAgentUI.tsx`
- `src/hooks/useVoiceAgent.ts`
