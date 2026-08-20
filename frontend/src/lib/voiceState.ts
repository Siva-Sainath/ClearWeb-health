import type { PatientProfile } from "@/lib/types";
import { buildActivityLabel } from "@/lib/voiceCopy";

export type VoiceState =
  | "standby"
  | "ready"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

export function deriveVoiceState(params: {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isTranscribing: boolean;
  isProcessing: boolean;
  error: string | null;
}): VoiceState {
  if (params.error) return "error";
  if (params.isListening) return "listening";
  if (params.isTranscribing) return "transcribing";
  if (params.isSpeaking) return "speaking";
  if (params.isProcessing) return "thinking";
  if (params.isActive) return "ready";
  return "standby";
}

export function resolveActivityLabel(
  voiceState: VoiceState,
  phase: "onboarding" | "scraping" | "results",
  profile: PatientProfile | undefined
): string | null {
  if (voiceState === "transcribing") {
    return null;
  }
  if (voiceState === "thinking") {
    return buildActivityLabel(phase, profile, "thinking");
  }
  return null;
}
