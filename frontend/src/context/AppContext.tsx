"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type {
  JourneyPhase,
  PatientProfile,
  ScrapeStatus,
  ScrapePresentationMode,
  FacilityResult,
  ScraperLog,
} from "@/lib/types";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { LlmExplanation } from "@/lib/llmExplanation";
import type { ScrapeContextPayload, BrainSessionResponse } from "@/lib/scrapeSession";
import type { ConductResultsResponse } from "@/hooks/useResultsConductor";
import { EMPTY_PROFILE } from "@/lib/types";
import { normalizeProfilePartial } from "@/lib/profileNormalize";

interface AppContextType {
  journeyPhase: JourneyPhase;
  setJourneyPhase: (phase: JourneyPhase) => void;
  patientProfile: PatientProfile;
  setPatientProfile: React.Dispatch<React.SetStateAction<PatientProfile>>;
  updateProfile: (partial: Partial<PatientProfile>) => void;
  scrapeJobId: string | null;
  setScrapeJobId: (id: string | null) => void;
  scrapeStatus: ScrapeStatus;
  setScrapeStatus: (status: ScrapeStatus) => void;
  scrapePresentationMode: ScrapePresentationMode;
  setScrapePresentationMode: (mode: ScrapePresentationMode) => void;
  replayEvents: ScraperLog[];
  setReplayEvents: (events: ScraperLog[]) => void;
  facilities: Record<string, FacilityResult>;
  setFacilities: (f: Record<string, FacilityResult>) => void;
  scrapeEvents: ScraperLog[];
  setScrapeEvents: (events: ScraperLog[]) => void;
  scrapeLastUpdated: string | null;
  setScrapeLastUpdated: (v: string | null) => void;
  scrapeHealEvents: Array<{ collector_id?: string; reason?: string; success?: boolean; timestamp?: string }>;
  setScrapeHealEvents: (events: Array<{ collector_id?: string; reason?: string; success?: boolean; timestamp?: string }>) => void;
  executiveSummary: ScrapeExecutiveSummary | null;
  setExecutiveSummary: (summary: ScrapeExecutiveSummary | null) => void;
  llmExplanation: LlmExplanation | null;
  setLlmExplanation: (explanation: LlmExplanation | null) => void;
  scrapeContext: ScrapeContextPayload | null;
  setScrapeContext: (ctx: ScrapeContextPayload | null) => void;
  sessionPresentation: ConductResultsResponse | null;
  setSessionPresentation: (p: ConductResultsResponse | null) => void;
  applyBrainSession: (session: BrainSessionResponse) => void;
  isListening: boolean;
  setIsListening: (v: boolean) => void;
  isSpeaking: boolean;
  setIsSpeaking: (v: boolean) => void;
  lastAgentMessage: string | null;
  setLastAgentMessage: (msg: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhase>("onboarding");
  const [patientProfile, setPatientProfile] = useState<PatientProfile>({ ...EMPTY_PROFILE });
  const [scrapeJobId, setScrapeJobId] = useState<string | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>("idle");
  const [scrapePresentationMode, setScrapePresentationMode] =
    useState<ScrapePresentationMode>(null);
  const [replayEvents, setReplayEvents] = useState<ScraperLog[]>([]);
  const [facilities, setFacilities] = useState<Record<string, FacilityResult>>({});
  const [scrapeEvents, setScrapeEvents] = useState<ScraperLog[]>([]);
  const [scrapeLastUpdated, setScrapeLastUpdated] = useState<string | null>(null);
  const [scrapeHealEvents, setScrapeHealEvents] = useState<
    Array<{ collector_id?: string; reason?: string; success?: boolean; timestamp?: string }>
  >([]);
  const [executiveSummary, setExecutiveSummary] = useState<ScrapeExecutiveSummary | null>(null);
  const [llmExplanation, setLlmExplanation] = useState<LlmExplanation | null>(null);
  const [scrapeContext, setScrapeContext] = useState<ScrapeContextPayload | null>(null);
  const [sessionPresentation, setSessionPresentation] = useState<ConductResultsResponse | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAgentMessage, setLastAgentMessage] = useState<string | null>(null);

  const updateProfile = useCallback((partial: Partial<PatientProfile>) => {
    setPatientProfile((prev) => ({ ...prev, ...normalizeProfilePartial(partial, prev) }));
  }, []);

  const applyBrainSession = useCallback((session: BrainSessionResponse) => {
    if (session.results) setFacilities(session.results);
    if (session.events) setScrapeEvents(session.events);
    if (session.replayEvents?.length) setReplayEvents(session.replayEvents);
    if (session.healEvents) setScrapeHealEvents(session.healEvents);
    if (session.lastUpdated) setScrapeLastUpdated(session.lastUpdated);
    if (session.executiveSummary !== undefined) setExecutiveSummary(session.executiveSummary);
    if (session.explanation !== undefined) setLlmExplanation(session.explanation);
    if (session.scrapeContext !== undefined) setScrapeContext(session.scrapeContext ?? null);
    if (session.presentation !== undefined) setSessionPresentation(session.presentation ?? null);
    if (session.presentationMode) setScrapePresentationMode(session.presentationMode);
    if (session.jobId) setScrapeJobId(session.jobId);
  }, []);

  const value = useMemo(
    () => ({
      journeyPhase,
      setJourneyPhase,
      patientProfile,
      setPatientProfile,
      updateProfile,
      scrapeJobId,
      setScrapeJobId,
      scrapeStatus,
      setScrapeStatus,
      scrapePresentationMode,
      setScrapePresentationMode,
      replayEvents,
      setReplayEvents,
      facilities,
      setFacilities,
      scrapeEvents,
      setScrapeEvents,
      scrapeLastUpdated,
      setScrapeLastUpdated,
      scrapeHealEvents,
      setScrapeHealEvents,
      executiveSummary,
      setExecutiveSummary,
      llmExplanation,
      setLlmExplanation,
      scrapeContext,
      setScrapeContext,
      sessionPresentation,
      setSessionPresentation,
      applyBrainSession,
      isListening,
      setIsListening,
      isSpeaking,
      setIsSpeaking,
      lastAgentMessage,
      setLastAgentMessage,
    }),
    [
      journeyPhase,
      patientProfile,
      updateProfile,
      scrapeJobId,
      scrapeStatus,
      scrapePresentationMode,
      replayEvents,
      facilities,
      scrapeEvents,
      scrapeLastUpdated,
      scrapeHealEvents,
      executiveSummary,
      llmExplanation,
      scrapeContext,
      sessionPresentation,
      applyBrainSession,
      isListening,
      isSpeaking,
      lastAgentMessage,
    ]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
