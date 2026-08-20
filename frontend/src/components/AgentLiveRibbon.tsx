"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AvatarIcon from "@/components/AvatarPresenter";
import { VOICE_COPY } from "@/lib/voiceCopy";
import type { VoiceState } from "@/lib/voiceState";

interface AgentLiveRibbonProps {
  voiceState: VoiceState;
  isSpeaking: boolean;
  audioLevel: number;
  caption: string;
  activityLabel?: string | null;
  lastAgentLine?: string;
}

export default function AgentLiveRibbon({
  voiceState,
  isSpeaking,
  audioLevel,
  caption,
  activityLabel,
  lastAgentLine,
}: AgentLiveRibbonProps) {
  const visible =
    voiceState === "listening" ||
    voiceState === "thinking" ||
    voiceState === "transcribing" ||
    isSpeaking;

  const line = useMemo(() => {
    if (voiceState === "listening") return VOICE_COPY.listening;
    if (voiceState === "thinking" || voiceState === "transcribing") {
      return activityLabel || VOICE_COPY.thinking;
    }
    if (isSpeaking && caption) return caption;
    return lastAgentLine || caption || VOICE_COPY.standby;
  }, [voiceState, isSpeaking, caption, activityLabel, lastAgentLine]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className="fixed top-[5.25rem] left-1/2 -translate-x-1/2 z-30 w-[min(90vw,32rem)] pointer-events-none"
        >
          <div className="glass-accent flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg max-w-full">
            <div className="scale-[0.72] origin-center flex-shrink-0">
              <AvatarIcon
                voiceState={voiceState}
                isSpeaking={isSpeaking}
                audioLevel={audioLevel}
                hideLabels
              />
            </div>
            <p className="text-sm sm:text-base text-[var(--color-text-primary)] leading-snug line-clamp-2" aria-live="polite">
              {line}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
