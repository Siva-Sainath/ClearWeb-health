"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { LayoutMode } from "@/lib/uiActions";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface ResultsLayoutShellProps {
  layoutMode: LayoutMode;
  hero?: React.ReactNode;
  savings?: React.ReactNode;
  trust?: React.ReactNode;
  compare?: React.ReactNode;
  charts: React.ReactNode;
  cards: React.ReactNode;
  flashcards?: React.ReactNode;
  summary?: React.ReactNode;
}

export default function ResultsLayoutShell({
  layoutMode,
  hero,
  savings,
  trust,
  compare,
  charts,
  cards,
  flashcards,
  summary,
}: ResultsLayoutShellProps) {
  const reducedMotion = useReducedMotion();

  const chartClass =
    layoutMode === "stageFocus"
      ? "order-3 opacity-30 pointer-events-none max-h-[200px] overflow-hidden"
      : layoutMode === "chartFocus" || layoutMode === "savingsStory"
      ? "order-1"
      : layoutMode === "compareSplit"
        ? "order-3"
        : "order-2";

  const cardsClass =
    layoutMode === "stageFocus"
      ? "order-1 relative z-10"
      : layoutMode === "spotlightHero" || layoutMode === "mapRoute"
      ? "order-3 opacity-90"
      : layoutMode === "chartFocus"
        ? "order-3"
        : "order-4";

  return (
    <div className="space-y-6">
      <AnimatePresence mode="popLayout">
        {layoutMode === "spotlightHero" && hero && (
          <motion.div
            key="hero"
            layout
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            {hero}
          </motion.div>
        )}

        {layoutMode === "savingsStory" && savings && (
          <motion.div
            key="savings"
            layout
            initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {savings}
          </motion.div>
        )}

        {trust && (layoutMode === "explore" || layoutMode === "trustGaps") && (
          <motion.div
            key="trust"
            layout
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {trust}
          </motion.div>
        )}

        {layoutMode === "compareSplit" && compare && (
          <motion.div
            key="compare"
            layout
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {compare}
          </motion.div>
        )}
      </AnimatePresence>

      {summary && layoutMode === "explore" && <div className="order-0">{summary}</div>}

      {flashcards && layoutMode !== "trustGaps" && layoutMode !== "stageFocus" && (
        <motion.div layout className="order-1">{flashcards}</motion.div>
      )}

      <motion.div layout className={chartClass}>{charts}</motion.div>

      <motion.div layout className={cardsClass}>{cards}</motion.div>
    </div>
  );
}
