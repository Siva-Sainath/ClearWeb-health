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
  executiveSummary: ScrapeExecutiveSummary | null;
  setExecutiveSummary: (summary: ScrapeExecutiveSummary | null) => void;
  llmExplanation: LlmExplanation | null;
  setLlmExplanation: (explanation: LlmExplanation | null) => void;
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
  const [executiveSummary, setExecutiveSummary] = useState<ScrapeExecutiveSummary | null>(null);
  const [llmExplanation, setLlmExplanation] = useState<LlmExplanation | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAgentMessage, setLastAgentMessage] = useState<string | null>(null);

  const updateProfile = useCallback((partial: Partial<PatientProfile>) => {
    setPatientProfile((prev) => ({ ...prev, ...normalizeProfilePartial(partial, prev) }));
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
      executiveSummary,
      setExecutiveSummary,
      llmExplanation,
      setLlmExplanation,
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
      executiveSummary,
      llmExplanation,
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
