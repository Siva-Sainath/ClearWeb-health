"use client";

import { useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { useDashboard } from "@/context/DashboardContext";
import { buildScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";

function facilitySummaries(facilities: Record<string, { hospital_name: string; insurance_price: number; distance_mi: number; rating: number; accredited: boolean }>) {
  return Object.entries(facilities).map(([id, f]) => ({
    id,
    name: f.hospital_name,
    price: f.insurance_price,
    distance_mi: f.distance_mi,
    rating: f.rating,
    accredited: f.accredited,
  }));
}

export default function AppStateBridge() {
  const {
    journeyPhase,
    patientProfile,
    scrapeStatus,
    scrapeJobId,
    scrapePresentationMode,
    facilities,
    scrapeEvents,
    scrapeHealEvents,
    executiveSummary,
    llmExplanation,
    isListening,
    isSpeaking,
    lastAgentMessage,
  } = useAppContext();
  const { state: dashState } = useDashboard();

  const summary =
    executiveSummary ??
  (Object.keys(facilities).length
      ? buildScrapeExecutiveSummary(patientProfile, facilities, scrapeEvents)
      : null);

  useEffect(() => {
    const snapshot = {
      journeyPhase,
      voicePhase: journeyPhase,
      patientProfile,
      scrapeStatus,
      scrapeJobId,
      scrapePresentationMode,
      dashboard: dashState,
      facilities: facilitySummaries(facilities),
      facilityCount: Object.keys(facilities).length,
      scrapeHealEvents: scrapeHealEvents?.slice(-8),
      recentScrapeEvents: scrapeEvents?.slice(-12).map((e) => ({
        event: e.event,
        hospital_id: e.hospital_id,
        collector_id: e.collector_id,
        cache_hit: e.cache_hit,
        detail: e.detail?.slice(0, 120),
      })),
      executiveSummary: summary
        ? {
            priceRange: summary.priceRange,
            recommendation: summary.recommendation.id,
            missed: summary.missed,
            partialIssues: summary.partialIssues,
            procedure: summary.procedure,
          }
        : null,
      llmExplanation: llmExplanation
        ? {
            layout: llmExplanation.layout,
            suggestedFollowUps: llmExplanation.suggestedFollowUps,
            recommendation: llmExplanation.recommendation,
          }
        : null,
      topRecommendationId: dashState.spotlightId ?? summary?.recommendation?.id,
      isListening,
      isSpeaking,
      lastAgentMessage,
      timestamp: new Date().toISOString(),
    };

    fetch("/api/page-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    }).catch(() => {});
  }, [
    journeyPhase,
    patientProfile,
    scrapeStatus,
    scrapeJobId,
    scrapePresentationMode,
    facilities,
    scrapeEvents,
    scrapeHealEvents,
    executiveSummary,
    llmExplanation,
    summary,
    isListening,
    isSpeaking,
    lastAgentMessage,
    dashState,
  ]);

  return null;
}
