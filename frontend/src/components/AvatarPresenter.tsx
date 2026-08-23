"use client";

import { tokens } from "@/lib/design-tokens";
import { voiceStateLabel } from "@/lib/voiceCopy";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { VoiceState } from "@/lib/voiceState";
import { cn } from "@/lib/utils";
import VoiceRing from "@/components/VoiceRing";

interface AvatarIconProps {
  voiceState: VoiceState;
  isSpeaking: boolean;
  audioLevel: number;
  freqData?: Uint8Array | null;
  caption?: string;
  activityLabel?: string | null;
  compact?: boolean;
  hideLabels?: boolean;
}

function ringBorder(voiceState: VoiceState): string {
  switch (voiceState) {
    case "listening":
      return tokens.voice.listening;
    case "thinking":
    case "transcribing":
      return tokens.voice.thinking;
    case "speaking":
      return tokens.accent;
    case "error":
      return tokens.voice.error;
    case "ready":
      return tokens.voice.ready;
    default:
      return tokens.voice.standby;
  }
}

function AvatarCircle({
  voiceState,
  isSpeaking,
  audioLevel,
  size,
}: {
  voiceState: VoiceState;
  isSpeaking: boolean;
  audioLevel: number;
  size: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-14 h-14" : "w-20 h-20";
  const textSize = size === "sm" ? "text-xl" : "text-2xl";

  return (
    <div
      className={cn("rounded-full flex items-center justify-center", dim)}
      style={{
        background: `radial-gradient(circle at 35% 35%, ${tokens.surfaceRaised}, ${tokens.surface})`,
        borderWidth: 1.5,
        borderStyle: "solid",
        borderColor: ringBorder(voiceState),
        boxShadow:
          voiceState === "listening"
            ? `0 0 ${16 + audioLevel * 24}px ${tokens.voice.listeningGlow}`
            : voiceState === "speaking" && isSpeaking
              ? `0 0 ${12 + audioLevel * 20}px ${tokens.accentMuted}`
              : undefined,
        transition: "border-color 0.4s ease, box-shadow 0.15s ease",
      }}
    >
      <span className={cn("font-serif font-bold select-none gradient-text", textSize)}>A</span>
    </div>
  );
}

export default function AvatarIcon({
  voiceState,
  isSpeaking,
  audioLevel,
  freqData,
  caption,
  activityLabel,
  compact = false,
  hideLabels = false,
}: AvatarIconProps) {
  const reducedMotion = useReducedMotion();

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          {!reducedMotion && (
            <div className="absolute inset-0 -m-3 opacity-80 pointer-events-none">
              <VoiceRing
                voiceState={voiceState}
                audioLevel={audioLevel}
                freqData={freqData}
                size={72}
              />
            </div>
          )}
          <AvatarCircle
            voiceState={voiceState}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
            size="sm"
          />
        </div>
      </div>
    );
  }

  const ringSize = 300;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative flex items-center justify-center overflow-visible"
        style={{ width: ringSize, height: ringSize }}
      >
        {!reducedMotion && (
          <VoiceRing
            voiceState={voiceState}
            audioLevel={Math.max(audioLevel, voiceState === "standby" || voiceState === "ready" ? 0.12 : 0)}
            freqData={freqData}
            size={ringSize}
            className="absolute inset-0"
          />
        )}

        <div className="relative z-10">
          <AvatarCircle
            voiceState={voiceState}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
            size="md"
          />
        </div>
      </div>

      {!hideLabels && (
        <div className="flex flex-col items-center gap-1.5 max-w-md">
          <span className="font-serif font-bold text-[var(--color-text-primary)] text-xl tracking-wide">
            Aria
          </span>
          {caption && (
            <p className="text-lg text-[var(--color-text-primary)] text-center leading-relaxed px-2">
              {caption}
            </p>
          )}
          {activityLabel && (
            <p className="font-mono text-xs text-[var(--color-text-secondary)] text-center px-2 tracking-wide">
              {activityLabel}
            </p>
          )}
          <p
            className="text-sm text-[var(--color-text-secondary)]"
            aria-live="polite"
            aria-atomic="true"
          >
            {voiceStateLabel(voiceState)}
          </p>
        </div>
      )}
    </div>
  );
}
