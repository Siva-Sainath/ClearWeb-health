"use client";

import { useCallback, useEffect, useRef } from "react";
import { parseActionStrings, type UIAction } from "@/lib/uiActions";
import type { LlmExplanation, ExplanationSection } from "@/lib/llmExplanation";
import type { FacilityResult } from "@/lib/types";
import { prefetchTts, stopTtsPlayback, speakScriptedQueued } from "@/lib/ttsSpeak";

function waitForLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

interface ExplanationStageProps {
  explanation: LlmExplanation;
  facilities?: Record<string, FacilityResult>;
  onSectionReveal?: (section: ExplanationSection, index: number) => void;
  onUiActions?: (actions: UIAction[]) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onCaptionChange?: (caption: string) => void;
  onComplete?: () => void;
  autoPlay?: boolean;
  /** Voice + UI only — no duplicate insight cards on screen */
  compact?: boolean;
}

function speechLine(section: ExplanationSection): string {
  if (section.type === "insight") return section.body;
  return section.reasons[0] ?? section.reasons.join(" ");
}

export default function ExplanationStage({
  explanation,
  onSectionReveal,
  onUiActions,
  onSpeakingChange,
  onCaptionChange,
  onComplete,
  autoPlay = true,
  compact = false,
}: ExplanationStageProps) {
  const playedRef = useRef(false);

  const revealSection = useCallback(
    (section: ExplanationSection, index: number) => {
      onSectionReveal?.(section, index);
      if (!compact && section.type === "facility_reveal") {
        requestAnimationFrame(() => {
          document
            .getElementById(`facility-${section.facilityId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    },
    [onSectionReveal, compact]
  );

  useEffect(() => {
    if (!autoPlay || playedRef.current) return;
    playedRef.current = true;

    const script = explanation.spokenScript?.trim() ?? "";
    if (script) prefetchTts(script);
    explanation.sections.forEach((section) => {
      const line = speechLine(section);
      if (line.trim()) prefetchTts(line);
    });

    const run = async () => {
      stopTtsPlayback();
      onSpeakingChange?.(true);
      try {
        if (script) {
          onCaptionChange?.(script);
          await speakScriptedQueued(script);
        }

        for (let i = 0; i < explanation.sections.length; i++) {
          const section = explanation.sections[i];
          if (section.uiActions?.length) {
            onUiActions?.(parseActionStrings(section.uiActions));
            await waitForLayout();
          }
          revealSection(section, i);

          const line = speechLine(section);
          if (line.trim()) {
            onCaptionChange?.(line);
            await speakScriptedQueued(line);
          }
        }
      } finally {
        onSpeakingChange?.(false);
        onCaptionChange?.("");
        onComplete?.();
      }
    };

    void run();
  }, [
    autoPlay,
    explanation,
    onCaptionChange,
    onSpeakingChange,
    onUiActions,
    onComplete,
    revealSection,
  ]);

  if (compact) return null;

  return (
    <section className="space-y-5" aria-labelledby="explanation-heading">
      <h2
        id="explanation-heading"
        className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
      >
        Aria&apos;s walkthrough
      </h2>
    </section>
  );
}
