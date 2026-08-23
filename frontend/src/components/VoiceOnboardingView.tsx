"use client";

import React, { useMemo, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Database, Radio, Loader2, PanelRightOpen } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useDashboard } from "@/context/DashboardContext";
import { useAriaAgent } from "@/hooks/useAriaAgent";
import { useScrapeJob } from "@/hooks/useScrapeJob";
import { useZipCacheProbe } from "@/hooks/useZipCacheProbe";
import { prefetchTtsLines } from "@/lib/ttsSpeak";
import { getOnboardingWelcomeChunks } from "@/lib/voiceCopy";
import CoverageDrawer from "@/components/CoverageDrawer";
import InteractionStage from "@/components/InteractionStage";
import OnboardingProgress from "@/components/OnboardingProgress";
import VoiceShell from "@/components/VoiceShell";
import { coverageBlockFromProfile } from "@/lib/coverageGate";
import { isProfileCoreReady, nextMissingField } from "@/lib/onboardingProgress";
import type { PatientProfile } from "@/lib/types";

function CacheStatusBanner({
  zipProbe,
}: {
  zipProbe: ReturnType<typeof useZipCacheProbe>;
}) {
  if (zipProbe.status === "idle") return null;

  if (zipProbe.status === "checking") {
    return (
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--color-text-tertiary)]">
        <Loader2 size={12} className="animate-spin" />
        Checking cached hospital prices for your ZIP…
      </p>
    );
  }

  if (zipProbe.status === "error") return null;

  const { cached, hospitalCount, zipKnown } = zipProbe.data;
  if (cached) {
    return (
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-violet-300">
        <Database size={13} />
        {hospitalCount} Austin-metro hospital{hospitalCount === 1 ? "" : "s"} cached — verified proof-reel
      </p>
    );
  }

  if (zipKnown === false) {
    return (
      <p className="mt-3 text-center text-xs text-amber-200/90 leading-relaxed max-w-md mx-auto">
        Demo coverage is <strong className="font-medium">Austin metro only</strong> (ZIP 78701–78759).
        Try <span className="font-mono">78701</span> for 12 real cached hospitals — or continue for Austin
        proof-reel with your procedure.
      </p>
    );
  }

  return (
    <p className="mt-3 flex items-center justify-center gap-2 text-xs text-emerald-300/90">
      <Radio size={13} />
      No cache for this ZIP — live scrape needs local Bright Data (Austin 787xx recommended)
    </p>
  );
}

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
  const zipProbe = useZipCacheProbe(patientProfile);
  const { applyActions, state: dashState, dispatch } = useDashboard();
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [coverageHintReady, setCoverageHintReady] = useState(false);
  const [textInputOpen, setTextInputOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [scrapeConfirmed, setScrapeConfirmed] = useState(false);
  const transitioningRef = useRef(false);
  const coverageOpenTimerRef = useRef<number | null>(null);
  const beginPriceSearchRef = useRef<(profile?: PatientProfile) => void>(() => {});

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
    onScrapeConfirm: () => beginPriceSearchRef.current(),
    onUIActions: applyActions,
    onThinkingChange: (thinking) => dispatch({ type: "SET_THINKING", payload: thinking }),
    dashState: agentDashState,
    onWelcomeStart: () => {
      setCoverageHintReady(true);
      if (coverageOpenTimerRef.current) window.clearTimeout(coverageOpenTimerRef.current);
      coverageOpenTimerRef.current = window.setTimeout(() => {
        coverageOpenTimerRef.current = null;
        if (!transitioningRef.current) setCoverageOpen(true);
      }, 650);
    },
    onCoverageNudge: () => {
      setCoverageHintReady(true);
      setCoverageOpen(true);
    },
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

      const coverageBlock = coverageBlockFromProfile(profile);
      if (coverageBlock) {
        setCoverageHintReady(true);
        setCoverageOpen(true);
        setLastAgentMessage(coverageBlock.speech);
        return;
      }

      transitioningRef.current = true;
      if (coverageOpenTimerRef.current) {
        window.clearTimeout(coverageOpenTimerRef.current);
        coverageOpenTimerRef.current = null;
      }
      setCoverageOpen(false);
      setCoverageHintReady(false);
      agent.stopVoiceSession();
      setScrapeConfirmed(true);
      setTransitioning(true);
      setIsListening(false);
      setIsSpeaking(false);
      void startScrape(profile);
    },
    [patientProfile, updateProfile, agent, startScrape, setIsListening, setIsSpeaking, setLastAgentMessage]
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

  React.useEffect(() => {
    if (!canPullPrices || transitioning) return;
    const t = window.setTimeout(() => beginPriceSearch(), 700);
    return () => window.clearTimeout(t);
  }, [canPullPrices, transitioning, beginPriceSearch]);

  const buttonLabel =
    zipProbe.status === "ready" && zipProbe.data.cached
      ? "Show cached prices (verified replay)"
      : zipProbe.status === "ready" && zipProbe.data.zipKnown === false
        ? "Show Austin demo (proof-reel)"
        : zipProbe.status === "ready" && !zipProbe.data.cached
          ? "Run live Bright Data scrape"
          : "Pull hospital prices near you";

  return (
    <div className="pb-24">
      <div className="px-6 pt-6 max-w-lg mx-auto">
        {coverageHintReady && (
          <div className="flex flex-col items-center mb-4 gap-1.5">
            <button
              type="button"
              onClick={() => setCoverageOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={coverageOpen}
              aria-controls="coverage-panel"
              aria-describedby="coverage-btn-help"
              className="inline-flex items-center gap-2 min-h-12 px-5 py-3 rounded-2xl text-base font-semibold text-[#07140f] bg-emerald-300 hover:bg-emerald-200 shadow-[0_0_28px_rgba(52,211,153,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              <PanelRightOpen size={20} aria-hidden />
              See what Aria can price
            </button>
            <p id="coverage-btn-help" className="text-xs text-center text-emerald-200/80 max-w-xs">
              Opens the Austin list: ZIPs, hospitals, procedures, and insurance plans.
            </p>
          </div>
        )}
        <OnboardingProgress profile={patientProfile} />
        <CacheStatusBanner zipProbe={zipProbe} />
        {canPullPrices && !transitioning && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 w-full py-3.5 rounded-2xl font-medium text-sm bg-[var(--color-accent)] text-black hover:opacity-90 transition-opacity shadow-[0_0_24px_rgba(52,211,153,0.25)]"
            onClick={() => beginPriceSearch()}
          >
            {buttonLabel}
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
      <CoverageDrawer open={coverageOpen} onOpenChange={setCoverageOpen} />
    </div>
  );
}
