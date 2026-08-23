/** Clearweb Health design tokens — use instead of inline hex in components */
export const tokens = {
  void: "#070d0a",
  surface: "#0e1612",
  surfaceRaised: "#15201a",
  border: "rgba(52, 211, 153, 0.12)",
  borderBright: "rgba(242, 249, 245, 0.12)",
  textPrimary: "#f2f9f5",
  textSecondary: "#8baba0",
  textTertiary: "#5c7a70",
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
