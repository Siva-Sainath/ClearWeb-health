"use client";

import { motion } from "framer-motion";
import { tokens } from "@/lib/design-tokens";

interface SavingsCalloutProps {
  min: number;
  max: number;
  cheapestName: string;
  cheapestPrice: number;
  savings: number;
}

export default function SavingsCallout({
  min,
  max,
  cheapestName,
  cheapestPrice,
  savings,
}: SavingsCalloutProps) {
  const span = max - min;
  const pct = span > 0 ? ((max - cheapestPrice) / span) * 100 : 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass rounded-2xl p-5 border border-emerald-500/20 space-y-4"
    >
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Savings story
        </h3>
        <p className="text-lg font-serif font-semibold text-[var(--color-text-primary)] mt-1">
          You could save <span style={{ color: tokens.accent }}>${savings}</span> vs the priciest option
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-[var(--color-text-tertiary)]">
          <span>${min}</span>
          <span>${max}</span>
        </div>
        <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden relative">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: tokens.accent }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(8, pct)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[var(--color-bg)]"
            style={{ backgroundColor: tokens.accentAlt, left: `${Math.min(96, pct)}%` }}
            initial={{ left: "0%" }}
            animate={{ left: `${Math.min(96, pct)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Lowest: <strong className="text-[var(--color-text-primary)]">{cheapestName}</strong> at $
          {cheapestPrice}
        </p>
      </div>
    </motion.section>
  );
}
