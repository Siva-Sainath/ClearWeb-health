/** Clearweb Health design tokens — use instead of inline hex in components */
export const tokens = {
  void: "#0a0a0b",
  surface: "#141416",
  surfaceRaised: "#1c1c1f",
  border: "rgba(180, 168, 140, 0.10)",
  borderBright: "rgba(255,255,255,0.1)",
  textPrimary: "#fafafa",
  textSecondary: "#a1a1aa",
  textTertiary: "#71717a",
  accent: "#34d399",
  accentAlt: "#6ee7b7",
  accentMuted: "rgba(52,211,153,0.15)",
  accentBorder: "rgba(52,211,153,0.25)",
  accentGlow: "rgba(52,211,153,0.35)",
  warn: "#fbbf24",
  info: "#38bdf8",
  error: "#f87171",
  voice: {
    listening: "#34d399",
    listeningGlow: "rgba(52,211,153,0.35)",
    thinking: "#38bdf8",
    speaking: "#6ee7b7",
    speakingRipple: "rgba(52,211,153,0.25)",
    error: "#fbbf24",
    standby: "#71717a",
    ready: "rgba(52,211,153,0.4)",
  },
} as const;

export const chartTheme = {
  accent: tokens.accent,
  accentAlt: tokens.accentAlt,
  warn: tokens.warn,
  grid: tokens.border,
  text: tokens.textTertiary,
} as const;
