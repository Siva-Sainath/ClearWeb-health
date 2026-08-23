"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScrapePresentationMode, PatientProfile, FacilityResult } from "@/lib/types";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { UIAction } from "@/lib/uiActions";
import { parseActionStrings } from "@/lib/uiActions";
import { usePresentationOrchestrator, type PresentationStep } from "@/hooks/usePresentationOrchestrator";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface ConductResultsResponse {
  spokenScript?: string;
  fullText?: string;
  steps?: PresentationStep[];
  actions?: UIAction[];
  uiActions?: string[];
  source?: string;
}

interface UseResultsConductorOptions {
  enabled: boolean;
  profile: PatientProfile;
  facilities: Record<string, FacilityResult>;
  presentationMode: ScrapePresentationMode | null;
  healEvents: Array<{ collector_id?: string; reason?: string; success?: boolean }>;
  executiveSummary: ScrapeExecutiveSummary | null;
  prebuiltPresentation?: ConductResultsResponse | null;
  onUiActions?: (actions: UIAction[]) => void;
  onCaptionChange?: (caption: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onPresentationStep?: (index: number) => void;
  onComplete?: () => void;
}

export function useResultsConductor({
  enabled,
  profile,
  facilities,
  presentationMode,
  healEvents,
  executiveSummary,
  prebuiltPresentation,
  onUiActions,
  onCaptionChange,
  onSpeakingChange,
  onPresentationStep,
  onComplete,
}: UseResultsConductorOptions) {
  const [conducting, setConducting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);
  const { play, stop } = usePresentationOrchestrator();

  const runConduct = useCallback(async () => {
    if (!enabled || ranRef.current || Object.keys(facilities).length === 0) return;
    ranRef.current = true;
    setConducting(true);
    setError(null);

    try {
      let data: ConductResultsResponse;

      if (prebuiltPresentation?.steps?.length || prebuiltPresentation?.spokenScript) {
        data = prebuiltPresentation;
      } else {
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
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `conduct-results failed (${res.status})`);
        }
        data = (await res.json()) as ConductResultsResponse;
      }
      const uiFromStrings = data.uiActions?.length ? parseActionStrings(data.uiActions) : [];
      const fallbackActions = [...(data.actions ?? []), ...uiFromStrings];

      await play({
        spokenScript: data.spokenScript?.trim() || data.fullText?.trim() || "",
        steps: data.steps,
        fallbackActions,
        onUiActions,
        onCaptionChange,
        onSpeakingChange,
        onStepIndex: onPresentationStep,
      });
      setConducting(false);
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conduct failed");
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
    prebuiltPresentation,
    onUiActions,
    onCaptionChange,
    onSpeakingChange,
    onPresentationStep,
    onComplete,
    play,
  ]);

  useEffect(() => {
    if (!enabled) return;
    void runConduct();
    return () => stop();
  }, [enabled, runConduct, stop]);

  return { conducting, error, rerun: runConduct, stop };
}
