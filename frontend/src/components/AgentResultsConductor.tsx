"use client";

/**
 * AgentResultsConductor — LLM-driven results walkthrough with honest labeling.
 * Replaces scripted ExplanationStage when NEXT_PUBLIC_AGENTIC_RESULTS=true.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Database, Radio, Film } from "lucide-react";
import { parseActionStrings, type UIAction } from "@/lib/uiActions";
import type { LlmExplanation, ExplanationSection } from "@/lib/llmExplanation";
import type { FacilityResult, ScrapePresentationMode } from "@/lib/types";
import { tokens } from "@/lib/design-tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { prefetchTts, ensureTtsReady, stopTtsPlayback, speakTtsQueued } from "@/lib/ttsSpeak";

function waitForLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function sectionLine(section: ExplanationSection): string {
  if (section.type === "insight") return `${section.title}. ${section.body}`;
  return section.reasons.join(". ");
}

function modeLabel(mode: ScrapePresentationMode | null): { label: string; icon: typeof Radio; tone: string } {
  if (mode === "live") {
    return { label: "Live scrape — real-time Bright Data run", icon: Radio, tone: "text-emerald-300" };
  }
  if (mode === "proof-reel" || mode === "replay") {
    return {
      label: "Verified replay — recorded scrape session at 8× speed",
      icon: Film,
      tone: "text-violet-300",
    };
  }
  if (mode === "instant") {
    return { label: "Cached snapshot — instant results", icon: Database, tone: "text-amber-300" };
  }
  return { label: "Cached hospital prices from our database", icon: Database, tone: "text-sky-300" };
}

interface AgentResultsConductorProps {
  explanation: LlmExplanation | null;
  facilities: Record<string, FacilityResult>;
  presentationMode: ScrapePresentationMode | null;
  onSectionReveal?: (section: ExplanationSection, index: number) => void;
  onUiActions?: (actions: UIAction[]) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onCaptionChange?: (caption: string) => void;
  onComplete?: () => void;
}

export default function AgentResultsConductor({
  explanation,
  facilities,
  presentationMode,
  onSectionReveal,
  onUiActions,
  onSpeakingChange,
  onCaptionChange,
  onComplete,
}: AgentResultsConductorProps) {
  const reducedMotion = useReducedMotion();
  const [revealedCount, setRevealedCount] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const playedRef = useRef(false);
  const mode = modeLabel(presentationMode);
  const ModeIcon = mode.icon;

  const revealSection = useCallback(
    (section: ExplanationSection, index: number) => {
      setRevealedCount((c) => Math.max(c, index + 1));
      setStepIndex(index);
      onSectionReveal?.(section, index);
      if (section.type === "facility_reveal") {
        requestAnimationFrame(() => {
          document
            .getElementById(`facility-${section.facilityId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    },
    [onSectionReveal]
  );

  useEffect(() => {
    if (!explanation || playedRef.current) return;
    playedRef.current = true;

    const script = explanation.spokenScript?.trim() ?? "";
    if (script) prefetchTts(script);
    explanation.sections.forEach((s) => {
      const line = sectionLine(s);
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
        if (explanation.uiActions?.length) {
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
          const line = sectionLine(section);
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
    explanation,
    onCaptionChange,
    onSpeakingChange,
    onUiActions,
    onComplete,
    revealSection,
  ]);

  if (!explanation) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass rounded-2xl p-6 border border-white/[0.08] flex items-center gap-4"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles size={22} style={{ color: tokens.accent }} />
        </motion.div>
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Aria is analyzing your hospital data…</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Building a personalized walkthrough from live results</p>
        </div>
      </motion.div>
    );
  }

  const visibleSections = explanation.sections.slice(0, revealedCount);
  const totalSteps = explanation.sections.length;

  return (
    <section className="space-y-4" aria-labelledby="agent-conductor-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: tokens.accent }} />
          <h2 id="agent-conductor-heading" className="text-sm font-semibold text-[var(--color-text-primary)]">
            Aria — live analysis
          </h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs ${mode.tone}`}>
          <ModeIcon size={12} />
          {mode.label}
        </span>
      </div>

      <div className="flex gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <motion.div
            key={i}
            className="h-1 flex-1 rounded-full overflow-hidden bg-white/10"
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: tokens.accent }}
              initial={{ width: "0%" }}
              animate={{ width: i <= stepIndex ? "100%" : "0%" }}
              transition={{ duration: reducedMotion ? 0 : 0.4 }}
            />
          </motion.div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {visibleSections.map((section, i) => (
          <motion.div
            key={
              section.type === "insight"
                ? `insight-${section.title}-${i}`
                : `facility-${section.facilityId}-${i}`
            }
            layout
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="glass rounded-xl p-5 border border-white/[0.08] ring-1 ring-white/[0.04]"
          >
            {section.type === "insight" ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  {section.title}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">{section.body}</p>
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
