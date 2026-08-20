"use client";

/**
 * ResultsView — voice-conducted results with layout modes, deterministic explanation, and cached data.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, MessageSquare, ChevronDown, ChevronUp, X, Navigation } from "lucide-react";
import { useAriaAgent } from "@/hooks/useAriaAgent";
import { useDashboard } from "@/context/DashboardContext";
import { useAppContext } from "@/context/AppContext";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useDrivingRoute } from "@/hooks/useDrivingRoute";
import { resolveFacilityCoords } from "@/lib/facilityGeo";
import VoiceShell from "./VoiceShell";
import AgentLiveRibbon from "./AgentLiveRibbon";
import ExecutiveSummaryPanel from "./ExecutiveSummaryPanel";
import ConsumerOptionCard from "./ConsumerOptionCard";
import ExplanationStage from "./ExplanationStage";
import ResultsTabShell from "./ResultsTabShell";
import FacilityFlashcards from "./FacilityFlashcards";
import AgentActionBar from "./AgentActionBar";
import SuggestionChips from "./SuggestionChips";
import { chipLabelToQuery } from "@/lib/followUpIntents";
import { prefetchTts } from "@/lib/ttsSpeak";
import ResultsLayoutShell from "./ResultsLayoutShell";
import ProviderHero from "./ProviderHero";
import SavingsCallout from "./SavingsCallout";
import CompareSplitView from "./CompareSplitView";
import ScrapeTrustPanel from "./ScrapeTrustPanel";
import ScrapeDemoActions from "./ScrapeDemoActions";
import { buildScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import { buildFacilityFlashcards } from "@/lib/facilityInsights";
import { insightSectionsFromExplanation } from "@/lib/llmExplanation";
import type { FacilityInsight } from "@/lib/facilityInsights";
import { tokens } from "@/lib/design-tokens";
import { BRAND } from "@/lib/brand";

export default function ResultsView() {
  const {
    patientProfile,
    facilities,
    scrapeEvents,
    executiveSummary,
    llmExplanation,
    setIsListening,
    setIsSpeaking,
    setLastAgentMessage,
    scrapePresentationMode,
  } = useAppContext();
  const [showTypeMode, setShowTypeMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null);
  const [revealedCardIds, setRevealedCardIds] = useState<Set<string>>(new Set());
  const [explanationCaption, setExplanationCaption] = useState("");
  const [explanationSpeaking, setExplanationSpeaking] = useState(false);
  const [walkthroughDone, setWalkthroughDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    state: dashState,
    dispatch,
    applyActions,
    filterFacilities,
    sortFacilities,
  } = useDashboard();
  const { location: userLoc, requestLocation } = useUserLocation(true);

  const userCoords = userLoc.status === "ready" ? userLoc.coords : null;

  const filteredFacilities = useMemo(
    () => filterFacilities(facilities),
    [filterFacilities, facilities]
  );

  const routeFacilityCoords = useMemo(() => {
    if (!routeTargetId || !facilities[routeTargetId]) return null;
    return resolveFacilityCoords(facilities[routeTargetId], patientProfile.zipCode);
  }, [routeTargetId, facilities, patientProfile.zipCode]);

  const { route: activeRoute } = useDrivingRoute(
    userCoords,
    routeFacilityCoords,
    !!routeTargetId && !!userCoords
  );

  const handleRouteFacility = useCallback(
    (facilityId: string) => {
      setRouteTargetId(facilityId);
      dispatch({ type: "spotlight", payload: facilityId });
      dispatch({ type: "tab", payload: "map" });
      dispatch({ type: "layout", payload: "mapRoute" });
      document.getElementById(`facility-${facilityId}`)?.scrollIntoView({ behavior: "smooth" });
    },
    [dispatch]
  );

  const summary = useMemo(
    () =>
      executiveSummary ??
      buildScrapeExecutiveSummary(patientProfile, facilities, scrapeEvents),
    [executiveSummary, patientProfile, facilities, scrapeEvents]
  );

  const cacheHits = useMemo(
    () => scrapeEvents.filter((e) => e.event === "mrf_downloaded" && e.cache_hit).length,
    [scrapeEvents]
  );
  const liveDownloads = useMemo(
    () => scrapeEvents.filter((e) => e.event === "mrf_downloaded" && !e.cache_hit).length,
    [scrapeEvents]
  );

  const flashcardInsights = useMemo((): FacilityInsight[] => {
    if (llmExplanation) {
      const topId = summary?.recommendation?.id ?? Object.keys(facilities)[0] ?? "";
      return insightSectionsFromExplanation(llmExplanation).map((s, i) => ({
        id: `llm-insight-${i}`,
        title: s.title,
        subtitle: s.emphasis ?? "summary",
        highlight: s.body,
        facilityId: topId,
        metric: s.emphasis ?? "insight",
        accent: s.emphasis ?? "summary",
      }));
    }
    return buildFacilityFlashcards(facilities, patientProfile);
  }, [llmExplanation, facilities, patientProfile, summary]);

  useEffect(() => {
    if (walkthroughDone) setChatOpen(true);
  }, [walkthroughDone]);

  useEffect(() => {
    if (!llmExplanation) return;
    const script = llmExplanation.spokenScript?.trim();
    if (script) prefetchTts(script);
    for (const section of llmExplanation.sections) {
      if (section.type === "insight") {
        prefetchTts(`${section.title}. ${section.body}`);
      } else if (section.reasons.length) {
        prefetchTts(section.reasons.join(". "));
      }
    }
  }, [llmExplanation]);

  const cardsToShow = useMemo(() => {
    if (!summary) return [];
    const entries = sortFacilities(
      Object.entries(filteredFacilities).map(([id, f]) => [id, f] as [string, typeof f])
    );
    const allRanked = summary.ranked.filter((o) => entries.some(([id]) => id === o.id));

    if (!llmExplanation || walkthroughDone) return allRanked;

    const revealed = new Set([...revealedCardIds, ...dashState.revealedFacilities]);
    return allRanked.filter((o) => revealed.has(o.id));
  }, [
    walkthroughDone,
    llmExplanation,
    revealedCardIds,
    dashState.revealedFacilities,
    summary,
    filteredFacilities,
    sortFacilities,
  ]);

  const handleExplanationReveal = useCallback(
    (section: { type: string; facilityId?: string }) => {
      if (section.type === "facility_reveal" && section.facilityId) {
        setRevealedCardIds((prev) => new Set(prev).add(section.facilityId!));
        dispatch({ type: "show_card", payload: section.facilityId! });
      }
    },
    [dispatch]
  );

  const walkthroughExplanation = useMemo(() => {
    if (!llmExplanation) return null;
    if (scrapePresentationMode === "replay") {
      return {
        ...llmExplanation,
        sections: llmExplanation.sections.filter(
          (s) => s.type !== "insight" || s.title !== "How we collected prices"
        ),
      };
    }
    return llmExplanation;
  }, [llmExplanation, scrapePresentationMode]);

  const suggestedChips = llmExplanation?.suggestedFollowUps ?? [
    "Show me the cheapest on a chart",
    "Compare my top two",
    "Put it on the map",
    "Help me book the top one",
    "Accredited hospitals only",
    "What didn't work?",
  ];

  const agent = useAriaAgent({
    phase: "results",
    profile: patientProfile,
    facilities,
    executiveSummary: summary,
    autoStart: !llmExplanation,
    onRouteFacility: handleRouteFacility,
    onThinkingChange: (thinking) => dispatch({ type: "SET_THINKING", payload: thinking }),
    dashState: {
      activeTab: dashState.activeTab,
      layoutMode: dashState.layoutMode,
      spotlightId: dashState.spotlightId,
      highlightId: dashState.highlightId,
      filterMode: dashState.filterMode,
      sortMode: dashState.sortMode,
      compareA: dashState.compareA,
      compareB: dashState.compareB,
      visibleCount: Object.keys(filteredFacilities).length,
      totalCount: Object.keys(facilities).length,
      suggestedFollowUps: suggestedChips,
    },
    onUIActions: applyActions,
    resultsSource: scrapePresentationMode,
  });

  useEffect(() => {
    if (agent.error) setShowTypeMode(true);
  }, [agent.error]);

  useEffect(() => {
    setIsListening(agent.isListening);
    setIsSpeaking(agent.isSpeaking);
    if (agent.caption) setLastAgentMessage(agent.caption);
  }, [agent.isListening, agent.isSpeaking, agent.caption, setIsListening, setIsSpeaking, setLastAgentMessage]);

  useEffect(() => {
    return () => {
      agent.stopVoiceSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastAgentLine = useMemo(
    () => [...agent.messages].reverse().find((m) => m.role === "agent" && m.text.trim())?.text,
    [agent.messages]
  );

  useEffect(() => {
    if (chatOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.messages, chatOpen]);

  const driveLabelFor = useCallback(
    (facilityId: string) => {
      if (routeTargetId === facilityId && activeRoute) {
        return `${Math.round(activeRoute.durationMin)} min drive · ${activeRoute.distanceMi.toFixed(1)} mi`;
      }
      const f = facilities[facilityId];
      if (!f) return null;
      if (f.drive_min) return `~${Math.round(f.drive_min)} min · ${f.distance_mi} mi`;
      return null;
    },
    [routeTargetId, activeRoute, facilities]
  );

  const handleChipSelect = useCallback(
    (label: string) => {
      void agent.sendTextFallback(chipLabelToQuery(label));
      setChatOpen(true);
    },
    [agent]
  );

  if (Object.keys(facilities).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <Loader2 size={32} className="animate-spin" style={{ color: tokens.accent }} />
        <p className="font-mono text-sm tracking-wide text-[var(--color-text-tertiary)]">
          Loading your results…
        </p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <Loader2 size={32} className="animate-spin" style={{ color: tokens.accent }} />
        <p className="text-sm text-[var(--color-text-secondary)]">Building your summary…</p>
      </div>
    );
  }

  const heroOption =
    summary.ranked.find((o) => o.id === dashState.spotlightId) ?? summary.recommendation;
  const cheapestOption = summary.ranked.reduce((a, b) =>
    a.facility.insurance_price < b.facility.insurance_price ? a : b
  );
  const compareOptionA =
    summary.ranked.find((o) => o.id === dashState.compareA) ?? summary.ranked[0];
  const compareOptionB =
    summary.ranked.find((o) => o.id === dashState.compareB) ?? summary.ranked[1];

  const {
    messages,
    isSpeaking,
    isListening,
    audioLevel,
    error,
    sendTextFallback,
    caption,
    voiceState,
    activityLabel,
    clearError,
    isProcessing,
  } = agent;

  return (
    <div className="w-full max-w-[min(100%,90rem)] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 pb-32 space-y-8">
      {!explanationSpeaking && (
        <AgentLiveRibbon
          voiceState={voiceState}
          isSpeaking={isSpeaking}
          audioLevel={audioLevel}
          caption={caption}
          activityLabel={activityLabel}
          lastAgentLine={lastAgentLine}
        />
      )}

      <AgentActionBar />

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {dashState.lastAction ?? ""}
      </div>

      <header className="space-y-3 pt-1">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)]">
          Your price options
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {summary.procedure} · {summary.insurance}
          {patientProfile.city?.trim() ? ` · ${patientProfile.city.trim()}` : ""}
          {patientProfile.zipCode?.trim() ? ` · ${patientProfile.zipCode.trim()}` : ""}
          {patientProfile.radiusMi > 0 ? ` · ${patientProfile.radiusMi} mi` : ""}
        </p>
        {cacheHits > 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Demo cache: {cacheHits} hospital file{cacheHits > 1 ? "s" : ""} from disk
            {liveDownloads > 0 ? ` · ${liveDownloads} live` : ""} — real MRF pricing
          </p>
        )}
        {userLoc.status === "denied" && (
          <button
            type="button"
            onClick={requestLocation}
            className="text-xs flex items-center gap-1.5"
            style={{ color: tokens.accent }}
          >
            <Navigation size={12} /> Enable location for drive times &amp; routes
          </button>
        )}
      </header>

      <ScrapeDemoActions />

      {explanationSpeaking && explanationCaption && (
        <p
          className="text-sm text-center text-[var(--color-text-secondary)] leading-relaxed px-5 py-3 glass rounded-xl border border-white/[0.06]"
          aria-live="polite"
        >
          {explanationCaption}
        </p>
      )}

      {walkthroughExplanation && !walkthroughDone && (
        <ExplanationStage
          explanation={walkthroughExplanation}
          facilities={facilities}
          onSectionReveal={handleExplanationReveal}
          onUiActions={applyActions}
          onSpeakingChange={setExplanationSpeaking}
          onCaptionChange={setExplanationCaption}
          onComplete={() => setWalkthroughDone(true)}
        />
      )}

      <ResultsLayoutShell
        layoutMode={dashState.layoutMode}
        summary={
          dashState.layoutMode === "explore" ? <ExecutiveSummaryPanel summary={summary} /> : undefined
        }
        flashcards={
          walkthroughDone &&
          flashcardInsights.length > 0 &&
          dashState.layoutMode !== "trustGaps" ? (
            <FacilityFlashcards
              insights={flashcardInsights}
              spotlightId={dashState.spotlightId}
              onSelect={(id) => {
                dispatch({ type: "spotlight", payload: id });
                dispatch({ type: "tab", payload: "map" });
              }}
            />
          ) : undefined
        }
        hero={
          <ProviderHero
            option={heroOption}
            savingsVsMax={summary.priceRange.max - heroOption.facility.insurance_price}
            driveLabel={driveLabelFor(heroOption.id)}
            onRoute={userCoords ? () => handleRouteFacility(heroOption.id) : undefined}
          />
        }
        savings={
          <SavingsCallout
            min={summary.priceRange.min}
            max={summary.priceRange.max}
            cheapestName={cheapestOption.facility.hospital_name}
            cheapestPrice={cheapestOption.facility.insurance_price}
            savings={summary.priceRange.max - cheapestOption.facility.insurance_price}
          />
        }
        trust={
          <ScrapeTrustPanel
            summary={summary}
            cacheHits={cacheHits}
            liveDownloads={liveDownloads}
          />
        }
        compare={
          compareOptionA && compareOptionB ? (
            <CompareSplitView
              optionA={compareOptionA}
              optionB={compareOptionB}
              facilities={facilities}
            />
          ) : null
        }
        charts={
          <ResultsTabShell
            facilities={filteredFacilities}
            zipCode={patientProfile.zipCode}
            userCoords={userCoords}
            activeRoute={activeRoute}
            routeTargetId={routeTargetId}
            onOpenChat={() => setChatOpen(true)}
          />
        }
        cards={
          <section className="space-y-4 w-full" aria-live="polite" aria-atomic="false">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Ranked for you
            </h2>
            {llmExplanation && !walkthroughDone && cardsToShow.length === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)] glass rounded-2xl p-4">
                Cards appear here as Aria walks through each hospital option.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {cardsToShow.map((option) => (
                <motion.div
                  key={option.id}
                  id={`facility-${option.id}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  layout
                  className={`w-full ${
                    dashState.highlightId === option.id
                      ? "ring-2 ring-emerald-400/50 rounded-2xl"
                      : ""
                  }`}
                >
                  <ConsumerOptionCard
                    option={option}
                    highlighted={option.rank === 1}
                    spotlight={dashState.spotlightId === option.id}
                    driveLabel={driveLabelFor(option.id)}
                    onShowRoute={
                      userCoords ? () => handleRouteFacility(option.id) : undefined
                    }
                    onSpotlight={() => {
                      dispatch({ type: "spotlight", payload: option.id });
                      dispatch({ type: "layout", payload: "spotlightHero" });
                    }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            </div>
          </section>
        }
      />

      <section className="glass rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setChatOpen((p) => !p)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <MessageSquare size={16} style={{ color: tokens.accent }} />
            Ask {BRAND.agentName} a follow-up
          </span>
          {chatOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/[0.06]"
            >
              <div className="p-4 space-y-4 border-t border-white/[0.06]">
                <SuggestionChips
                  suggestions={suggestedChips}
                  onSelect={handleChipSelect}
                  disabled={isProcessing || explanationSpeaking}
                />
                {messages.filter((m) => m.text).length === 0 && (
                  <p className="text-sm text-[var(--color-text-tertiary)] text-center py-2">
                    Pick a suggestion above, tap the mic, or type a question below.
                  </p>
                )}
                <div className="space-y-3 max-h-[360px] overflow-y-auto">
                {error && (
                  <div
                    className="text-sm rounded-xl p-3 flex gap-2"
                    style={{
                      color: tokens.warn,
                      backgroundColor: "rgba(251,191,36,0.08)",
                      border: "1px solid rgba(251,191,36,0.2)",
                    }}
                    role="alert"
                  >
                    <span className="flex-1">{error}</span>
                    <button type="button" onClick={() => clearError()} aria-label="Dismiss">
                      <X size={12} />
                    </button>
                  </div>
                )}
                {messages.filter((m) => m.text).map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className="font-mono text-[9px] text-[var(--color-text-tertiary)] uppercase mb-1">
                      {msg.role === "agent" ? BRAND.agentLabel : "You"}
                    </div>
                    <div
                      className={`glass px-4 py-3 rounded-2xl max-w-[95%] text-sm leading-relaxed text-[var(--color-text-primary)] ${
                        msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                      }`}
                    >
                      {msg.text}
                    </div>
                    {msg.role === "agent" &&
                      msg.attachmentId &&
                      facilities[msg.attachmentId] &&
                      dashState.shownCards.includes(msg.attachmentId) && (
                        <div className="mt-2 w-full max-w-[95%]">
                          <ConsumerOptionCard
                            option={{
                              id: msg.attachmentId,
                              rank: 0,
                              facility: facilities[msg.attachmentId],
                              reasons: [],
                            }}
                            spotlight
                          />
                        </div>
                      )}
                  </div>
                ))}
                <div ref={bottomRef} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <VoiceShell
        phase="results"
        compact
        caption={caption}
        voiceState={voiceState}
        activityLabel={activityLabel}
        error={error}
        isActive={agent.isActive}
        isSpeaking={isSpeaking}
        isListening={isListening}
        audioLevel={audioLevel}
        textFallbackOpen={showTypeMode}
        textValue={textInput}
        onTextValueChange={setTextInput}
        onTextSubmit={() => {
          const trimmed = textInput.trim();
          if (!trimmed) return;
          void sendTextFallback(trimmed);
          setTextInput("");
          setChatOpen(true);
        }}
        onMicToggle={() => void agent.toggleVoiceInput()}
        onTypeFallback={() => setShowTypeMode((p) => !p)}
      />
    </div>
  );
}
