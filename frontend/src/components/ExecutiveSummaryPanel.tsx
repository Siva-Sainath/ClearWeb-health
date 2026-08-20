"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  Sparkles,
  MapPin,
  Shield,
} from "lucide-react";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import { tokens } from "@/lib/design-tokens";

interface ExecutiveSummaryPanelProps {
  summary: ScrapeExecutiveSummary;
}

export default function ExecutiveSummaryPanel({ summary }: ExecutiveSummaryPanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass glass-accent rounded-2xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: tokens.accentMuted, border: `1px solid ${tokens.accentBorder}` }}
        >
          <Search size={18} style={{ color: tokens.accent }} />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-serif font-semibold text-[var(--color-text-primary)]">
            Your search summary
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">
            Plain-language recap of what Aria searched, found, and recommends.
          </p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {summary.bullets.map((line, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-[var(--color-text-primary)] leading-relaxed">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: tokens.accent }} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {(summary.partialIssues.length > 0 || summary.missed.length > 0) && (
        <div className="space-y-3 pt-1 border-t border-white/[0.06]">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Gaps &amp; caveats
          </p>
          {summary.partialIssues.map((item) => (
            <div key={item.name} className="flex gap-2 text-sm text-[var(--color-text-secondary)]">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: tokens.warn }} />
              <span>
                <strong className="text-[var(--color-text-primary)]">{item.name}:</strong> {item.issue}
              </span>
            </div>
          ))}
          {summary.missed.map((item) => (
            <div key={item.name} className="flex gap-2 text-sm text-[var(--color-text-secondary)]">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: tokens.warn }} />
              <span>
                <strong className="text-[var(--color-text-primary)]">{item.name}:</strong> {item.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        className="rounded-xl p-4 space-y-2"
        style={{ backgroundColor: tokens.accentMuted, border: `1px solid ${tokens.accentBorder}` }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: tokens.accent }} />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Why we recommend {summary.recommendation.facility.hospital_name}
          </span>
        </div>
        <ul className="space-y-1.5">
          {summary.recommendation.reasons.map((r) => (
            <li key={r} className="text-sm text-[var(--color-text-secondary)] flex gap-2">
              <span style={{ color: tokens.accent }}>·</span>
              {r}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 pt-2 text-xs text-[var(--color-text-tertiary)]">
          <span className="flex items-center gap-1">
            <MapPin size={12} /> {summary.recommendation.facility.distance_mi} mi
          </span>
          <span className="flex items-center gap-1">
            <Shield size={12} />{" "}
            {summary.recommendation.facility.accredited ? "Accredited" : "Not accredited"}
          </span>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
        Estimates from public hospital price pages — not a quote from your insurer. Confirm with the
        provider before scheduling.
      </p>
    </motion.section>
  );
}
