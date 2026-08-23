"use client";

import React, { useMemo, useState, useCallback, useRef } from "react";
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
import { isProfileCoreReady, nextMissingField } from "@/lib/onboardingProgress";
import type { PatientProfile } from "@/lib/types";

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
  const transitioningRef = useRef(false);

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

  const beginPriceSearchRef = useRef<(profile?: PatientProfile) => void>(() => {});

  React.useEffect(() => {
    prefetchTtsLines(getOnboardingWelcomeChunks());
  }, []);

  const agent = useAriaAgent({
    phase: "onboarding",
    profile: patientProfile,
    autoStart: true,
    onProfileUpdate: updateProfile,
    onPhaseNavigate: (p) => setJourneyPhase(p),
    onScrapeConfirm: () => beginPriceSearchRef.current(),
    onUIActions: applyActions,
    onThinkingChange: (thinking) => dispatch({ type: "SET_THINKING", payload: thinking }),
    dashState: agentDashState,
  });

  const beginPriceSearch = useCallback(
    (profileOverride?: PatientProfile) => {
      if (transitioningRef.current) return;

      let profile = profileOverride ?? patientProfile;
      if (profile.radiusMi <= 0) {
        profile = { ...profile, radiusMi: 25 };
        updateProfile({ radiusMi: 25 });
      }

      if (!isProfileCoreReady(profile)) return;

      transitioningRef.current = true;
      agent.stopVoiceSession();
      setScrapeConfirmed(true);
      setTransitioning(true);
      setFlashZoom(true);
      setIsListening(false);
      setIsSpeaking(false);

      window.setTimeout(() => {
        void startScrape(profile);
      }, 480);
    },
    [patientProfile, updateProfile, agent, startScrape, setIsListening, setIsSpeaking]
  );

  beginPriceSearchRef.current = beginPriceSearch;

  React.useEffect(() => {
    setIsListening(agent.isListening);
    setIsSpeaking(agent.isSpeaking);
    if (agent.caption) setLastAgentMessage(agent.caption);
  }, [agent.isListening, agent.isSpeaking, agent.caption, setIsListening, setIsSpeaking, setLastAgentMessage]);

  const showText = textInputOpen || !!agent.error;
  const profileReady = isProfileReady(patientProfile);
  const canPullPrices = isProfileCoreReady(patientProfile);
  const mergeBubbles = scrapeConfirmed && canPullPrices;
  const missing = nextMissingField(patientProfile);

  const handleConfirmScrape = useCallback(() => {
    beginPriceSearch();
  }, [beginPriceSearch]);

  return (
    <div className="pb-24">
      <div className="px-6 pt-6 max-w-lg mx-auto">
        <OnboardingProgress profile={patientProfile} />
        {canPullPrices && !transitioning && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 w-full py-3.5 rounded-2xl font-medium text-sm bg-[var(--color-accent)] text-black hover:opacity-90 transition-opacity shadow-[0_0_24px_rgba(52,211,153,0.25)] disabled:opacity-50"
            onClick={handleConfirmScrape}
          >
            Pull hospital prices near you
          </motion.button>
        )}
        {!canPullPrices && missing && agent.voiceState === "standby" && (
          <p className="mt-3 text-center text-xs text-[var(--color-text-tertiary)]">
            Still need: {missing}
          </p>
        )}
        {canPullPrices && !profileReady && !transitioning && (
          <p className="mt-2 text-center text-xs text-[var(--color-text-tertiary)]">
            Radius defaults to 25 miles if you skip it
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
