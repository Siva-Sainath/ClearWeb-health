// ─── Design Tokens ───────────────────────────────────────────────────────────
// Single source of truth for all color, timing, and physics constants.
// Updated to: Medical Green + White palette (no pink / no purple).

// Colors (mirror the CSS variables in globals.css)
export const COLOR = {
  VOID: "#070D0A", // Very dark green-tinted void
  SURFACE: "#0B1510", // Deep forest surface
  SURFACE_RAISED: "#111E16", // Slightly lighter panel surface
  BORDER: "#1C2E22", // Subtle dark-green border
  BORDER_BRIGHT: "#2A4434", // Active / hover border

  TEXT_PRIMARY: "#F2F9F5", // Near-white with green tint
  TEXT_SECONDARY: "#8BABA0", // Muted sage
  TEXT_TERTIARY: "#4A6458", // Very muted — labels, timestamps

  // Primary accent — medical green
  GREEN: "#00C896",
  GREEN_DIM: "rgba(0,200,150,0.15)",
  GREEN_BRIGHT: "#00FFBA", // Highlight / glow peak

  // Secondary accent — mint / teal
  MINT: "#00E5C8",
  MINT_DIM: "rgba(0,229,200,0.12)",

  // Neutral highlight — pure white
  WHITE: "#FFFFFF",
  WHITE_DIM: "rgba(255,255,255,0.08)",
} as const;

// ─── Framer Motion Spring Presets ────────────────────────────────────────────

/** For the swinging spider-bot avatar — heavy pendulum physics */
export const SPRING_AVATAR = {
  type: "spring" as const,
  stiffness: 55,
  damping: 10,
  mass: 1.8,
};

/** For UI cards flying in — snappy spring */
export const SPRING_CARD = {
  type: "spring" as const,
  stiffness: 120,
  damping: 18,
};

/** For conversation bubbles — gentle entrance */
export const SPRING_BUBBLE = {
  type: "spring" as const,
  stiffness: 100,
  damping: 20,
};

/** For the 3D tilt gesture on price cards */
export const SPRING_TILT = { stiffness: 200, damping: 25 };

// ─── ScrapeCanvas Layout ─────────────────────────────────────────────────────

/** SVG viewBox center — the NEXUS position */
export const NEXUS_CX = 450;
export const NEXUS_CY = 280;

/** Radius of the central nexus core circle */
export const NEXUS_RADIUS = 34;

// ─── Web Background ───────────────────────────────────────────────────────────

/** Number of radial spokes in the SVG background web */
export const WEB_SPOKES = 18;

/** Radii of the concentric polygon rings in the background */
export const WEB_RING_RADII = [80, 145, 210, 275, 340, 405, 470] as const;

/** Parallax travel distance in pixels for the background web */
export const WEB_PARALLAX_RANGE = 18;

// ─── Animation Timings ───────────────────────────────────────────────────────

/** How long each onboarding scan step shows (ms) */
export const SCAN_STEP_DURATION_MS = 520;

/** How long the scraping phase runs before advancing to results (ms) */
export const SCRAPING_PHASE_DURATION_MS = 13_000;

/** Max tilt angle (degrees) for 3D price card hover effect */
export const PRICE_CARD_TILT_MAX_DEG = 8;
