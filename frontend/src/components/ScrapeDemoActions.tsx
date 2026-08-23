"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Film, Radio, Sparkles, Wrench } from "lucide-react";
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
            Bright Data platform proof — Austin metro
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Scraper Studio collectors, Web Unlocker downloads, and self-healing — replayed from real
            events. Prices are from verified CMS machine-readable files (MRF), not estimates.
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
          className="h-9 text-xs border border-white/10"
          onClick={() => void startLiveScrape()}
        >
          <Radio size={14} className="mr-1.5" />
          Run live scrape now
        </Button>
        <Link
          href="/showcase/heal"
          className="inline-flex items-center h-9 px-3 text-xs rounded-md border border-sky-500/30 text-sky-200 hover:bg-sky-950/40 transition-colors"
        >
          <Wrench size={14} className="mr-1.5" />
          Watch St. Luke&apos;s self-heal (BD Act 2)
        </Link>
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
