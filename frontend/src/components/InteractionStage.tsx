"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AvatarIcon from "@/components/AvatarPresenter";
import ProfileFieldBubbles, { isProfileReady } from "@/components/ProfileFieldBubbles";
import MergedProfileChip from "@/components/MergedProfileChip";
import type { VoiceState } from "@/lib/voiceState";
import type { PatientProfile, VapiMessage } from "@/lib/types";
import { VOICE_COPY } from "@/lib/voiceCopy";

interface InteractionStageProps {
  voiceState: VoiceState;
  isSpeaking: boolean;
  audioLevel: number;
  caption: string;
  activityLabel?: string | null;
  messages: VapiMessage[];
  profile: PatientProfile;
  mergeBubbles?: boolean;
}

export default function InteractionStage({
  voiceState,
  isSpeaking,
  audioLevel,
  caption,
  activityLabel,
  messages,
  profile,
  mergeBubbles = false,
}: InteractionStageProps) {
  const [showMergedChip, setShowMergedChip] = useState(false);

  const lastUser = useMemo(
    () => [...messages].reverse().find((m) => m.role === "user" && m.text.trim()),
    [messages]
  );
  const lastAgentText = useMemo(
    () => [...messages].reverse().find((m) => m.role === "agent" && m.text.trim()),
    [messages]
  );

  const centerLine = useMemo(() => {
    if (voiceState === "listening") return VOICE_COPY.listening;
    if (voiceState === "thinking" || voiceState === "transcribing") {
      return activityLabel || VOICE_COPY.thinking;
    }
    if (isSpeaking && caption) return caption;
    if (lastAgentText?.text) return lastAgentText.text;
    if (caption) return caption;
    return VOICE_COPY.standby;
  }, [voiceState, isSpeaking, caption, activityLabel, lastAgentText]);

  const profileReady = isProfileReady(profile);
  const merging = mergeBubbles && profileReady;

  useEffect(() => {
    if (!merging) setShowMergedChip(false);
  }, [merging]);

  const handleFlyComplete = useCallback(() => {
    setShowMergedChip(true);
  }, []);

  return (
    <div className="relative w-full min-h-[min(640px,78vh)] flex flex-col items-center justify-center px-6 py-12 sm:py-14 isolate">
      <ProfileFieldBubbles
        profile={profile}
        merge={merging}
        onFlyComplete={handleFlyComplete}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 sm:gap-9 max-w-2xl w-full pt-6 pb-8">
        <AvatarIcon
          voiceState={voiceState}
          isSpeaking={isSpeaking}
          audioLevel={audioLevel}
          hideLabels
        />

        <AnimatePresence>
          {showMergedChip && (
            <motion.div
              key="merged-chip"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="w-full flex justify-center overflow-hidden"
            >
              <MergedProfileChip profile={profile} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={centerLine.slice(0, 48)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="text-center space-y-4 px-6 w-full max-w-xl mx-auto"
          >
            <p
              className="text-xl sm:text-2xl leading-relaxed text-[var(--color-text-primary)] font-light"
              aria-live="polite"
            >
              {centerLine}
            </p>

            {lastUser && voiceState !== "listening" && (
              <p className="text-sm text-[var(--color-text-tertiary)] max-w-lg mx-auto">
                You said:{" "}
                <span className="text-[var(--color-text-secondary)]">&ldquo;{lastUser.text}&rdquo;</span>
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {profileReady && showMergedChip && voiceState === "ready" && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-[var(--color-text-secondary)] text-center max-w-md px-2"
          >
            Say &ldquo;start searching&rdquo; when you&apos;re ready — Aria will crawl hospital sites live.
          </motion.p>
        )}

        {profileReady && !showMergedChip && !merging && voiceState === "ready" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-[var(--color-text-secondary)] text-center"
          >
            Profile complete — tell Aria when to start searching.
          </motion.p>
        )}
      </div>
    </div>
  );
}
