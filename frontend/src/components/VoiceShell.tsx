"use client";

import React from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import AvatarIcon from "@/components/AvatarPresenter";
import { VOICE_COPY, PHASE_LABEL } from "@/lib/voiceCopy";
import type { VoiceState } from "@/lib/voiceState";
import type { JourneyPhase } from "@/lib/types";

interface VoiceShellProps {
  phase: JourneyPhase;
  caption: string;
  voiceState: VoiceState;
  activityLabel?: string | null;
  isActive: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  error?: string | null;
  micEnabled?: boolean;
  onMicToggle?: () => void;
  onTypeFallback?: () => void;
  showTypeToggle?: boolean;
  hideAvatar?: boolean;
  textFallbackOpen?: boolean;
  textValue?: string;
  onTextValueChange?: (value: string) => void;
  onTextSubmit?: () => void;
  className?: string;
  /** Minimal floating mic — caption lives in InteractionStage */
  compact?: boolean;
}

function formatVoiceError(error: string): string {
  const lower = error.toLowerCase();
  if (lower === "network") return "Voice service offline — type below";
  if (lower.includes("microphone") || lower.includes("mic")) return "Allow mic access";
  if (lower.includes("connection")) return error;
  return error.length > 48 ? `${error.slice(0, 48)}…` : error;
}

function micAriaLabel(state: VoiceState, micEnabled: boolean): string {
  if (!micEnabled) return "Microphone unavailable";
  if (state === "listening") return "Aria is listening";
  if (state === "speaking") return "Aria is speaking";
  if (state === "thinking" || state === "transcribing") return "Aria is working";
  if (state === "error") return "Retry voice input";
  return "Tap to talk to Aria";
}

function micRingClass(state: VoiceState): string {
  switch (state) {
    case "listening":
      return "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-void)]";
    case "error":
      return "ring-2 ring-[var(--color-warn)] ring-offset-2 ring-offset-[var(--color-void)]";
    case "thinking":
    case "transcribing":
      return "opacity-60";
    default:
      return "";
  }
}

export default function VoiceShell({
  phase,
  caption,
  voiceState,
  activityLabel,
  isActive,
  isSpeaking,
  audioLevel,
  error,
  micEnabled = true,
  onMicToggle,
  onTypeFallback,
  showTypeToggle = true,
  hideAvatar = false,
  textFallbackOpen = false,
  textValue = "",
  onTextValueChange,
  onTextSubmit,
  className,
  compact = false,
}: VoiceShellProps) {
  const displayCaption =
    caption ||
    (voiceState === "listening"
      ? VOICE_COPY.listening
      : isActive
        ? VOICE_COPY.ready
        : VOICE_COPY.standby);

  if (compact) {
    return (
      <div
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-full glass-pill",
          className
        )}
      >
        {error && (
          <span className="text-xs text-[var(--color-warn)] max-w-[160px] truncate" role="alert">
            {formatVoiceError(error)}
          </span>
        )}
        {textFallbackOpen && (
          <input
            type="text"
            autoFocus
            value={textValue}
            onChange={(e) => onTextValueChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onTextSubmit?.();
              }
            }}
            placeholder="Type to Aria…"
            className="w-36 sm:w-48 rounded-full bg-[var(--color-surface)] border px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            style={{ borderColor: tokens.borderBright }}
          />
        )}
        {showTypeToggle && onTypeFallback && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTypeFallback}
            aria-label="Type instead"
            aria-pressed={textFallbackOpen}
            className="h-10 w-10 rounded-full p-0"
          >
            <Keyboard size={16} />
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="icon"
          onClick={onMicToggle}
          disabled={!micEnabled || voiceState === "thinking" || voiceState === "transcribing"}
          aria-label={micAriaLabel(voiceState, micEnabled)}
          className={cn("h-12 w-12 rounded-full focus-visible:ring-[var(--color-accent)]", micRingClass(voiceState))}
        >
          {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-[var(--color-void)]/90 backdrop-blur-xl",
        className
      )}
      style={{ borderColor: tokens.border }}
    >
      <div className="container mx-auto max-w-5xl px-4 py-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
            {PHASE_LABEL[phase]}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] hidden sm:inline">
            {VOICE_COPY.trustLine}
          </span>
        </div>

        <div className="flex items-end gap-4">
          {!hideAvatar && (
            <div className="hidden sm:block flex-shrink-0 scale-[0.85] origin-bottom-left">
              <AvatarIcon
                voiceState={voiceState}
                isSpeaking={isSpeaking}
                audioLevel={audioLevel}
                activityLabel={activityLabel}
                compact
              />
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-2">
            {error && (
              <p className="text-sm text-[var(--color-warn)] leading-relaxed" role="alert">
                {error}
              </p>
            )}

            {textFallbackOpen && (
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={textValue}
                  onChange={(e) => onTextValueChange?.(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onTextSubmit?.();
                    }
                  }}
                  placeholder="Type your message to Aria…"
                  className="flex-1 rounded-xl bg-[var(--color-surface)] border px-4 py-3 text-base text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  style={{ borderColor: tokens.borderBright }}
                />
                <Button type="button" size="sm" onClick={onTextSubmit} disabled={!textValue.trim()}>
                  Send
                </Button>
              </div>
            )}

            {activityLabel && voiceState === "thinking" && (
              <p className="font-mono text-xs text-[var(--color-text-secondary)] truncate">
                {activityLabel}
              </p>
            )}

            <motion.p
              key={displayCaption.slice(0, 40)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
              aria-atomic="true"
              className="text-lg leading-relaxed text-[var(--color-text-primary)] min-h-[3rem] line-clamp-3"
            >
              {displayCaption}
            </motion.p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {showTypeToggle && onTypeFallback && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onTypeFallback}
                aria-label="Type instead"
                aria-pressed={textFallbackOpen}
                className={cn(
                  "focus-visible:ring-[var(--color-accent)]",
                  (textFallbackOpen || voiceState === "error") &&
                    "border-[var(--color-accent)]/40 text-[var(--color-text-primary)]"
                )}
              >
                <Keyboard size={16} />
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              size="icon"
              onClick={onMicToggle}
              disabled={!micEnabled || voiceState === "thinking" || voiceState === "transcribing"}
              aria-label={micAriaLabel(voiceState, micEnabled)}
              className={cn("focus-visible:ring-[var(--color-accent)]", micRingClass(voiceState))}
            >
              {micEnabled ? <Mic size={22} /> : <MicOff size={22} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
