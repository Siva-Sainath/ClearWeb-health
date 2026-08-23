import type { JourneyPhase, PatientProfile } from "@/lib/types";
import { BRAND } from "@/lib/brand";
import { getCoverageWelcomeChunks, getCoverageWelcomeSpoken } from "@/lib/coverageFacts";

/** Single source for voice UI strings — calm, plain, said once. */
export const VOICE_COPY = {
  standby: "Tap anywhere to hear Aria, then tap the mic and speak.",
  ready: "I'm listening — just speak.",
  listening: "Listening…",
  listeningSeconds: (sec: number) => `Listening, ${sec}s…`,
  transcribing: "Transcribing…",
  thinking: "One moment…",
  speaking: "Aria is speaking",
  micDenied: "Microphone blocked. Allow access in your browser, or type below.",
  speechNetwork:
    "Live transcription is offline — you can still type below, or we'll record and transcribe your voice.",
  recordingFailed: "Recording failed. Try again or use the keyboard.",
  tooShort: "Hold the mic a little longer — at least two seconds.",
  noAudio: "No audio captured — check your mic and try again.",
  emptyTranscript: "Couldn't hear anything — try speaking for two or three seconds.",
  connectionError: "Connection error — try again or type below.",
  trustLine: "AI guide — not medical advice",
} as const;

/** One spoken welcome — avoids double "Hi" from multi-chunk playback. */
export function getOnboardingWelcomeSpoken(): string {
  return getCoverageWelcomeSpoken(BRAND.agentName);
}

/** Shown on screen after greeting (same text). */
export function getOnboardingWelcomeCaption(): string {
  return getOnboardingWelcomeSpoken();
}

export function getOnboardingWelcomeChunks(): string[] {
  return getCoverageWelcomeChunks(BRAND.agentName);
}

export function getOnboardingWelcomeMessage(): string {
  return getOnboardingWelcomeSpoken();
}

export const PHASE_LABEL: Record<JourneyPhase, string> = {
  onboarding: "Onboarding with Aria",
  scraping: "Searching prices…",
  results: "Discussing results",
};

export const HERO_SUBTITLE: Record<JourneyPhase, string> = {
  onboarding: "Look at the coverage panel — then tell Aria what to price",
  scraping: "Pulling prices from hospitals near you…",
  results: "Here’s what we found — tap a chip or just ask.",
};

export const HERO_SUBTITLE_ACTIVE = "What are you trying to get priced?";

export function buildActivityLabel(
  phase: JourneyPhase,
  profile: PatientProfile | undefined,
  mode: "thinking" | "transcribing" | "scraping"
): string | null {
  if (mode === "transcribing") return null;

  if (mode === "scraping") {
    const proc = profile?.procedure || profile?.condition;
    if (proc && profile?.zipCode) {
      return `Searching · ${proc} · ${profile.zipCode} · ${profile.radiusMi} mi`;
    }
    return "Starting hospital search…";
  }

  const parts: string[] = [];
  const proc = profile?.procedure || profile?.condition;
  if (proc) parts.push(proc);
  if (profile?.insurance) parts.push(profile.insurance);
  if (profile?.zipCode) parts.push(profile.zipCode);
  if (profile?.radiusMi) parts.push(`${profile.radiusMi} mi`);

  if (parts.length >= 2) {
    return phase === "results"
      ? `Looking at your options · ${parts.join(" · ")}`
      : `Updating your search profile · ${parts.join(" · ")}`;
  }

  if (phase === "results") return "Looking at your options…";
  return "Updating your search profile…";
}

export function voiceStateLabel(state: string): string {
  switch (state) {
    case "standby":
      return "Standby";
    case "ready":
      return "Ready";
    case "listening":
      return "Listening";
    case "transcribing":
      return "Transcribing";
    case "thinking":
      return "One moment";
    case "speaking":
      return "Speaking";
    case "error":
      return "Needs attention";
    default:
      return "Ready";
  }
}
