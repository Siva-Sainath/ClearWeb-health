"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseActionStrings, type UIAction } from "@/lib/uiActions";
import type { LlmExplanation, ExplanationSection } from "@/lib/llmExplanation";
import type { FacilityResult } from "@/lib/types";
import { tokens } from "@/lib/design-tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { speakTts, prefetchTts, ensureTtsReady, stopTtsPlayback, speakTtsQueued } from "@/lib/ttsSpeak";

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
}

function insightSpeechLine(section: ExplanationSection): string {
  if (section.type !== "insight") return "";
  if (section.title === "Your price range") {
    return section.body;
  }
  if (section.title === "How we collected prices") {
    return "Next I'm showing how Bright Data crawled each hospital price file — check the timeline on screen.";
  }
  if (section.title === "What we searched") {
    return section.body;
  }
  return `${section.title}. ${section.body}`;
}

function facilitySpeechLine(section: ExplanationSection): string {
  if (section.type !== "facility_reveal") return "";
  return section.reasons.join(" ");
}

export default function ExplanationStage({
  explanation,
  facilities = {},
  onSectionReveal,
  onUiActions,
  onSpeakingChange,
  onCaptionChange,
  onComplete,
  autoPlay = true,
}: ExplanationStageProps) {
  const reducedMotion = useReducedMotion();
  const [revealedCount, setRevealedCount] = useState(0);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const playedRef = useRef(false);

  const revealSection = useCallback(
    (section: ExplanationSection, index: number) => {
      setRevealedCount((c) => Math.max(c, index + 1));
      onSectionReveal?.(section, index);
      if (section.type === "insight") {
        setLiveAnnouncement(`${section.title}: ${section.body}`);
      } else {
        const name =
          facilities[section.facilityId]?.hospital_name ?? section.facilityId;
        setLiveAnnouncement(`Showing ${name}`);
        requestAnimationFrame(() => {
          document
            .getElementById(`facility-${section.facilityId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    },
    [onSectionReveal, facilities]
  );

  useEffect(() => {
    if (!autoPlay || playedRef.current) return;
    playedRef.current = true;

    const script = explanation.spokenScript?.trim() ?? "";
    if (script) prefetchTts(script);
    explanation.sections.forEach((section, i) => {
      const line =
        section.type === "insight"
          ? insightSpeechLine(section)
          : facilitySpeechLine(section);
      if (line.trim()) prefetchTts(line);
    });

    const run = async () => {
      stopTtsPlayback();
      onSpeakingChange?.(true);
      try {
        const layoutMode = explanation.defaultLayout ?? explanation.layout;
        if (layoutMode && layoutMode !== "cards_then_map") {
          onUiActions?.(parseActionStrings([`layout:${layoutMode}`]));
          await waitForLayout();
        }

        if (explanation.uiActions.length) {
          onUiActions?.(parseActionStrings(explanation.uiActions));
          await waitForLayout();
        }

        if (script) {
          onCaptionChange?.(script);
          await ensureTtsReady(script);
          await speakTtsQueued(script);
        }

        for (let i = 0; i < explanation.sections.length; i++) {
          const section = explanation.sections[i];
          if (section.uiActions?.length) {
            onUiActions?.(parseActionStrings(section.uiActions));
            await waitForLayout();
          }
          revealSection(section, i);

          const line =
            section.type === "insight"
              ? insightSpeechLine(section)
              : facilitySpeechLine(section);
          if (line.trim()) {
            onCaptionChange?.(line);
            await speakTtsQueued(line);
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

  const visibleSections = explanation.sections.slice(0, revealedCount);

  return (
    <section className="space-y-5" aria-labelledby="explanation-heading">
      <h2
        id="explanation-heading"
        className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
      >
        Aria&apos;s walkthrough
      </h2>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <AnimatePresence initial={false}>
        {visibleSections.map((section, i) => (
          <motion.div
            key={
              section.type === "insight"
                ? `insight-${section.title}-${i}`
                : `facility-${section.facilityId}-${i}`
            }
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.35, ease: "easeOut" }}
            className="glass rounded-xl p-5 border border-white/[0.06] space-y-2"
          >
            {section.type === "insight" ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  {section.title}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                  {section.body}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {facilities[section.facilityId]?.hospital_name ?? "Hospital option"}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
                  {section.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span style={{ color: tokens.accent }}>•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  );
}
