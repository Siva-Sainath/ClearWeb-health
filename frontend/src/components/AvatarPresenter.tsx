"use client";

import { motion, AnimatePresence } from "framer-motion";
import { tokens } from "@/lib/design-tokens";
import { voiceStateLabel } from "@/lib/voiceCopy";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { VoiceState } from "@/lib/voiceState";
import { cn } from "@/lib/utils";

interface AvatarIconProps {
  voiceState: VoiceState;
  isSpeaking: boolean;
  audioLevel: number;
  caption?: string;
  activityLabel?: string | null;
  compact?: boolean;
  hideLabels?: boolean;
}

function WaveformBars({ audioLevel, reactive }: { audioLevel: number; reactive: boolean }) {
  const HEIGHTS = [0.4, 0.7, 1.0, 0.7, 0.4];
  return (
    <div className="flex items-center gap-[3px]" aria-hidden="true">
      {HEIGHTS.map((base, i) => {
        const h = reactive ? Math.max(6, base * 28 * (0.35 + audioLevel * 0.65)) : 6;
        return (
          <motion.div
            key={i}
            className="w-[3px] rounded-full bg-[var(--color-accent)]"
            animate={{ height: h }}
            transition={{ type: "spring", stiffness: 300, damping: 18, delay: i * 0.04 }}
          />
        );
      })}
    </div>
  );
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

export default function AvatarIcon({
  voiceState,
  isSpeaking,
  audioLevel,
  caption,
  activityLabel,
  compact = false,
  hideLabels = false,
}: AvatarIconProps) {
  const reducedMotion = useReducedMotion();
  const size = compact ? "w-20 h-20" : "w-32 h-32";
  const inner = compact ? "inset-[10px]" : "inset-[16px]";
  const showInputWave = voiceState === "listening";
  const showOutputWave = voiceState === "speaking" && isSpeaking;
  const showRipples = voiceState === "speaking" && isSpeaking && !reducedMotion;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn("relative flex items-center justify-center", size)}>
        <AnimatePresence>
          {showRipples &&
            [0, 0.5, 1.0].map((delay) => (
              <motion.div
                key={delay}
                className="absolute inset-0 rounded-full border"
                style={{ borderColor: tokens.voice.speakingRipple }}
                initial={{ scale: 1, opacity: 0.45 }}
                animate={{ scale: 1 + audioLevel * 1.2, opacity: 0 }}
                transition={{ duration: 1.8, delay, repeat: Infinity, ease: "easeOut" }}
              />
            ))}
        </AnimatePresence>

        {voiceState === "listening" && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-dashed"
            style={{ borderColor: tokens.voice.listening }}
            animate={reducedMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
        )}

        {voiceState === "ready" && (
          <div
            className={cn("absolute inset-0 rounded-full border", !reducedMotion && "avatar-ready-ring")}
            style={{ borderColor: tokens.voice.ready }}
          />
        )}

        {(voiceState === "thinking" || voiceState === "transcribing") && (
          <motion.div
            className="absolute inset-1 rounded-full border border-dotted"
            style={{ borderColor: tokens.voice.thinking }}
            animate={reducedMotion ? { opacity: 0.7 } : { rotate: 360, opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
          />
        )}

        <div
          className={cn(`absolute ${inner} rounded-full flex items-center justify-center`)}
          style={{
            background: `radial-gradient(circle at 35% 35%, ${tokens.surfaceRaised}, ${tokens.surface})`,
            borderWidth: 1.5,
            borderStyle: voiceState === "error" ? "dashed" : "solid",
            borderColor: ringBorder(voiceState),
            boxShadow:
              voiceState === "listening"
                ? `0 0 ${16 + audioLevel * 24}px ${tokens.voice.listeningGlow}`
                : voiceState === "speaking"
                  ? `0 0 ${12 + audioLevel * 16}px ${tokens.accentMuted}`
                  : undefined,
          }}
        >
          <span className={cn("font-serif font-bold select-none gradient-text", compact ? "text-xl" : "text-2xl")}>
            A
          </span>
        </div>
      </div>

      {!compact && !hideLabels && (
        <div className="flex flex-col items-center gap-2 max-w-md">
          <div className="flex items-center gap-3">
            <span className="font-serif font-bold text-[var(--color-text-primary)] text-xl tracking-wide">
              Aria
            </span>
            <WaveformBars audioLevel={audioLevel} reactive={showInputWave || showOutputWave} />
          </div>
          {caption && (
            <p className="text-lg text-[var(--color-text-primary)] text-center leading-relaxed px-2">{caption}</p>
          )}
          {activityLabel && (
            <p className="font-mono text-xs text-[var(--color-text-secondary)] text-center px-2 tracking-wide">
              {activityLabel}
            </p>
          )}
          <p className="text-sm text-[var(--color-text-secondary)]" aria-live="polite" aria-atomic="true">
            {voiceStateLabel(voiceState)}
          </p>
        </div>
      )}
    </div>
  );
}
