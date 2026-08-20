"use client";

import React from "react";
import { motion } from "framer-motion";
import { Film, Radio, Sparkles } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useScrapeJob } from "@/hooks/useScrapeJob";
import { tokens } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";

export default function ScrapeDemoActions() {
  const { scrapePresentationMode, scrapeStatus, patientProfile } = useAppContext();
  const { startReplayScrape, startLiveScrape } = useScrapeJob();

  const busy = scrapeStatus === "running";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.08] bg-[var(--color-surface-raised)]/60 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="shrink-0 mt-0.5" style={{ color: tokens.accent }} />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            {scrapePresentationMode === "instant"
              ? "Prices from a recent hospital scrape"
              : "Hospital search tools"}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            {scrapePresentationMode === "instant"
              ? "These numbers came from real Austin hospital price files we already collected. Watch a fast replay of how we crawled each site, or run a fresh live scrape through Bright Data."
              : "Replay the last search path or run Bright Data collectors live against hospital sites."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="h-9 text-xs border border-white/10"
          onClick={() => void startReplayScrape()}
        >
          <Film size={14} className="mr-1.5" />
          Watch how we searched
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="h-9 text-xs border border-[var(--color-accent)]/30"
          style={{ color: tokens.accentAlt }}
          onClick={() => void startLiveScrape()}
        >
          <Radio size={14} className="mr-1.5" />
          Run live scrape now
        </Button>
      </div>

      {patientProfile.city && patientProfile.zipCode && (
        <p className="text-[10px] text-[var(--color-text-tertiary)]">
          {patientProfile.procedure || patientProfile.condition} · {patientProfile.insurance} ·{" "}
          {patientProfile.city}, {patientProfile.zipCode}
        </p>
      )}
    </motion.div>
  );
}
