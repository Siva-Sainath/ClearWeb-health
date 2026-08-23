"use client";

import React, { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext } from "@/context/AppContext";
import { useDashboard } from "@/context/DashboardContext";
import { useAriaAgent } from "@/hooks/useAriaAgent";
import { useScrapeJob } from "@/hooks/useScrapeJob";
import { prefetchTtsLines } from "@/lib/ttsSpeak";
import { getOnboardingWelcomeChunks } from "@/lib/voiceCopy";
import InteractionStage from "@/components/InteractionStage";
import OnboardingProgress from "@/components/OnboardingProgress";
import VoiceShell from "@/components/VoiceShell";
import { isProfileReady } from "@/components/ProfileFieldBubbles";
import { nextMissingField } from "@/lib/onboardingProgress";

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
  const [textInputOpen, setTextInputOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [flashZoom, setFlashZoom] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [scrapeConfirmed, setScrapeConfirmed] = useState(false);

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

  React.useEffect(() => {
    prefetchTtsLines(getOnboardingWelcomeChunks());
  }, []);

  const agent = useAriaAgent({
    phase: "onboarding",
    profile: patientProfile,
    autoStart: true,
    onProfileUpdate: updateProfile,
    onPhaseNavigate: (p) => setJourneyPhase(p),
    onScrapeConfirm: () => setScrapeConfirmed(true),
    onUIActions: applyActions,
    onThinkingChange: (thinking) => dispatch({ type: "SET_THINKING", payload: thinking }),
    dashState: agentDashState,
  });

  React.useEffect(() => {
    setIsListening(agent.isListening);
    setIsSpeaking(agent.isSpeaking);
    if (agent.caption) setLastAgentMessage(agent.caption);
  }, [agent.isListening, agent.isSpeaking, agent.caption, setIsListening, setIsSpeaking, setLastAgentMessage]);

  const showText = textInputOpen || !!agent.error;
  const profileReady = isProfileReady(patientProfile);
  const mergeBubbles = scrapeConfirmed && profileReady;
  const missing = nextMissingField(patientProfile);

  const handleConfirmScrape = useCallback(() => {
    if (!profileReady) return;
    setScrapeConfirmed(true);
  }, [profileReady]);

  const handleFlyComplete = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
    setFlashZoom(true);
    const t = setTimeout(() => {
      void startScrape();
    }, 950);
    return () => clearTimeout(t);
  }, [startScrape, transitioning]);

  return (
    <div className="pb-24">
      <div className="px-6 pt-6 max-w-lg mx-auto">
        <OnboardingProgress profile={patientProfile} />
        {profileReady && !scrapeConfirmed && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 w-full py-3.5 rounded-2xl font-medium text-sm bg-[var(--color-accent)] text-black hover:opacity-90 transition-opacity shadow-[0_0_24px_rgba(52,211,153,0.25)]"
            onClick={handleConfirmScrape}
          >
            Pull hospital prices near you
          </motion.button>
        )}
        {!profileReady && missing && agent.voiceState === "standby" && (
          <p className="mt-3 text-center text-xs text-[var(--color-text-tertiary)]">
            Still need: {missing}
          </p>
        )}
      </div>
      <AnimatePresence>
        {flashZoom && (
          <motion.div
            className="flash-zoom"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, delay: 0.85 }}
          >
            <div className="flash-zoom-burst" />
          </motion.div>
        )}
      </AnimatePresence>

      <InteractionStage
        voiceState={agent.voiceState}
        isSpeaking={agent.isSpeaking}
        audioLevel={agent.audioLevel}
        freqData={agent.freqData}
        caption={agent.caption}
        activityLabel={agent.activityLabel}
        messages={agent.messages}
        profile={patientProfile}
        mergeBubbles={mergeBubbles}
        onFlyComplete={handleFlyComplete}
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
        onTypeFallback={() => setTextInputOpen((p) => !p)}
      />
    </div>
  );
}
