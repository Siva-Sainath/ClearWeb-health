"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScrapePresentationMode, PatientProfile, FacilityResult } from "@/lib/types";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { UIAction } from "@/lib/uiActions";
import { parseActionStrings } from "@/lib/uiActions";
import { prefetchTts, speakTtsQueued, stopTtsPlayback } from "@/lib/ttsSpeak";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface ConductResultsResponse {
  spokenScript?: string;
  fullText?: string;
  actions?: UIAction[];
  uiActions?: string[];
}

interface UseResultsConductorOptions {
  enabled: boolean;
  profile: PatientProfile;
  facilities: Record<string, FacilityResult>;
  presentationMode: ScrapePresentationMode | null;
  healEvents: Array<{ collector_id?: string; reason?: string; success?: boolean }>;
  executiveSummary: ScrapeExecutiveSummary | null;
  onUiActions?: (actions: UIAction[]) => void;
  onCaptionChange?: (caption: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onComplete?: () => void;
}

export function useResultsConductor({
  enabled,
  profile,
  facilities,
  presentationMode,
  healEvents,
  executiveSummary,
  onUiActions,
  onCaptionChange,
  onSpeakingChange,
  onComplete,
}: UseResultsConductorOptions) {
  const [conducting, setConducting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  const runConduct = useCallback(async () => {
    if (!enabled || ranRef.current || Object.keys(facilities).length === 0) return;
    ranRef.current = true;
    setConducting(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND}/api/agent/conduct-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          facilities,
          presentationMode,
          healEvents,
          executiveSummary,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `conduct-results failed (${res.status})`);
      }
      const data = (await res.json()) as ConductResultsResponse;
      const script = data.spokenScript?.trim() || data.fullText?.trim() || "";
      const uiFromStrings = data.uiActions?.length ? parseActionStrings(data.uiActions) : [];
      const actions = [...(data.actions ?? []), ...uiFromStrings];

      if (actions.length) onUiActions?.(actions);

      if (script) {
        prefetchTts(script);
        onSpeakingChange?.(true);
        onCaptionChange?.(script);
        stopTtsPlayback();
        await speakTtsQueued(script);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conduct failed");
      ranRef.current = false;
    } finally {
      onSpeakingChange?.(false);
      onCaptionChange?.("");
      setConducting(false);
      onComplete?.();
    }
  }, [
    enabled,
    profile,
    facilities,
    presentationMode,
    healEvents,
    executiveSummary,
    onUiActions,
    onCaptionChange,
    onSpeakingChange,
    onComplete,
  ]);

  useEffect(() => {
    if (!enabled) return;
    void runConduct();
  }, [enabled, runConduct]);

  return { conducting, error, rerun: runConduct };
}
