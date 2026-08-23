"use client";

import React, { useMemo } from "react";
import AvatarIcon from "@/components/AvatarPresenter";
import ProfileFieldBubbles, { isProfileReady } from "@/components/ProfileFieldBubbles";
import type { VoiceState } from "@/lib/voiceState";
import type { PatientProfile, VapiMessage } from "@/lib/types";
import { VOICE_COPY } from "@/lib/voiceCopy";
import { stripTags } from "@/lib/uiActions";

interface InteractionStageProps {
  voiceState: VoiceState;
  isSpeaking: boolean;
  audioLevel: number;
  freqData?: Uint8Array | null;
  caption: string;
  activityLabel?: string | null;
  messages: VapiMessage[];
  profile: PatientProfile;
  mergeBubbles?: boolean;
  onFlyComplete?: () => void;
}

export default function InteractionStage({
  voiceState,
  isSpeaking,
  audioLevel,
  freqData,
  caption,
  activityLabel,
  messages,
  profile,
  mergeBubbles = false,
  onFlyComplete,
}: InteractionStageProps) {
  const lastUser = useMemo(
    () => [...messages].reverse().find((m) => m.role === "user" && m.text.trim()),
    [messages]
  );
  const lastAgentText = useMemo(
    () => [...messages].reverse().find((m) => m.role === "agent" && m.text.trim()),
    [messages]
  );

  const centerLine = useMemo(() => {
    const pick = () => {
      if (voiceState === "listening") return VOICE_COPY.listening;
      if (voiceState === "transcribing") {
        return activityLabel || VOICE_COPY.transcribing;
      }
      if (voiceState === "thinking") {
        const streaming =
          caption &&
          caption !== VOICE_COPY.thinking &&
          caption !== VOICE_COPY.transcribing &&
          caption !== VOICE_COPY.listening;
        if (streaming) return caption;
        return activityLabel || VOICE_COPY.thinking;
      }
      if (isSpeaking && caption) return caption;
      if (caption && voiceState === "standby") return caption;
      if (lastAgentText?.text) return lastAgentText.text;
      if (caption) return caption;
      return VOICE_COPY.standby;
    };
    return stripTags(pick());
  }, [voiceState, isSpeaking, caption, activityLabel, lastAgentText]);

  const profileReady = isProfileReady(profile);
  const merging = mergeBubbles && profileReady;

  return (
    <div className="relative w-full min-h-[min(640px,78vh)] flex flex-col items-center justify-center px-6 py-12 sm:py-14 isolate">
      <ProfileFieldBubbles
        profile={profile}
        merge={merging}
        onFlyComplete={onFlyComplete}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 sm:gap-9 max-w-2xl w-full pt-6 pb-8">
        <AvatarIcon
          voiceState={voiceState}
          isSpeaking={isSpeaking}
          audioLevel={audioLevel}
          freqData={freqData}
          hideLabels
        />

        <p
          className="text-xl sm:text-2xl leading-relaxed text-[var(--color-text-primary)] font-light text-center px-6 w-full max-w-xl mx-auto"
          aria-live="polite"
        >
          {centerLine}
        </p>

        {lastUser && voiceState !== "listening" && voiceState !== "thinking" && voiceState !== "transcribing" && (
          <p className="text-sm text-[var(--color-text-tertiary)] max-w-lg mx-auto text-center">
            You said:{" "}
            <span className="text-[var(--color-text-secondary)]">&ldquo;{lastUser.text}&rdquo;</span>
          </p>
        )}
      </div>
    </div>
  );
}
