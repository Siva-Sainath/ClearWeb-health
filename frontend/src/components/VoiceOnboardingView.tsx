"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { useDashboard } from "@/context/DashboardContext";
import { useAriaAgent } from "@/hooks/useAriaAgent";
import { useScrapeJob } from "@/hooks/useScrapeJob";
import { prefetchWelcomeAudio } from "@/lib/ttsSpeak";
import InteractionStage from "@/components/InteractionStage";
import VoiceShell from "@/components/VoiceShell";
import { isProfileReady } from "@/components/ProfileFieldBubbles";

export default function VoiceOnboardingView() {
  const {
    patientProfile,
    updateProfile,
    setJourneyPhase,
    setIsListening,
    setIsSpeaking,
    setLastAgentMessage,
  } = useAppContext();
  const { startScrape } = useScrapeJob();
  const { applyActions, state: dashState, dispatch } = useDashboard();
  const [showText, setShowText] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [mergeBubbles, setMergeBubbles] = useState(false);

  const agentDashState = useMemo(
    () => ({
      activeTab: dashState.activeTab,
      layoutMode: dashState.layoutMode,
      spotlightId: dashState.spotlightId,
      highlightId: dashState.highlightId,
      filterMode: dashState.filterMode,
      sortMode: dashState.sortMode,
      compareA: dashState.compareA,
      compareB: dashState.compareB,
      visibleCount: 0,
      totalCount: 0,
    }),
    [
      dashState.activeTab,
      dashState.layoutMode,
      dashState.spotlightId,
      dashState.highlightId,
      dashState.filterMode,
      dashState.sortMode,
      dashState.compareA,
      dashState.compareB,
    ]
  );

  useEffect(() => {
    prefetchWelcomeAudio();
  }, []);

  const agent = useAriaAgent({
    phase: "onboarding",
    profile: patientProfile,
    autoStart: true,
    onProfileUpdate: updateProfile,
    onPhaseNavigate: (p) => setJourneyPhase(p),
    onScrapeConfirm: () => void startScrape(),
    onUIActions: applyActions,
    onThinkingChange: (thinking) => dispatch({ type: "SET_THINKING", payload: thinking }),
    dashState: agentDashState,
  });

  useEffect(() => {
    setIsListening(agent.isListening);
    setIsSpeaking(agent.isSpeaking);
    if (agent.caption) setLastAgentMessage(agent.caption);
  }, [agent.isListening, agent.isSpeaking, agent.caption, setIsListening, setIsSpeaking, setLastAgentMessage]);

  useEffect(() => {
    if (agent.error) setShowText(true);
  }, [agent.error]);

  useEffect(() => {
    if (isProfileReady(patientProfile) && !mergeBubbles) {
      const t = setTimeout(() => setMergeBubbles(true), 400);
      return () => clearTimeout(t);
    }
    if (!isProfileReady(patientProfile)) {
      setMergeBubbles(false);
    }
  }, [patientProfile, mergeBubbles]);

  return (
    <div className="pb-24">
      <InteractionStage
        voiceState={agent.voiceState}
        isSpeaking={agent.isSpeaking}
        audioLevel={agent.audioLevel}
        caption={agent.caption}
        activityLabel={agent.activityLabel}
        messages={agent.messages}
        profile={patientProfile}
        mergeBubbles={mergeBubbles}
      />

      <VoiceShell
        phase="onboarding"
        compact
        caption={agent.caption}
        voiceState={agent.voiceState}
        activityLabel={agent.activityLabel}
        error={agent.error}
        isActive={agent.isActive}
        isSpeaking={agent.isSpeaking}
        isListening={agent.isListening}
        audioLevel={agent.audioLevel}
        textFallbackOpen={showText}
        textValue={textInput}
        onTextValueChange={setTextInput}
        onTextSubmit={() => {
          const trimmed = textInput.trim();
          if (!trimmed) return;
          void agent.sendTextFallback(trimmed);
          setTextInput("");
        }}
        onMicToggle={() => {
          void agent.toggleVoiceInput();
        }}
        onTypeFallback={() => setShowText((p) => !p)}
      />
    </div>
  );
}
