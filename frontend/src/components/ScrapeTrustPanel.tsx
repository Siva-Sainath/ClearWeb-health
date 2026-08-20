"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Database } from "lucide-react";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import { tokens } from "@/lib/design-tokens";

interface ScrapeTrustPanelProps {
  summary: ScrapeExecutiveSummary;
  cacheHits?: number;
  liveDownloads?: number;
}

export default function ScrapeTrustPanel({
  summary,
  cacheHits = 0,
  liveDownloads = 0,
}: ScrapeTrustPanelProps) {
  const hasGaps = summary.missed.length > 0 || summary.partialIssues.length > 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 space-y-4 border border-amber-500/15"
    >
      <div className="flex items-start gap-3">
        <Database size={18} className="shrink-0 mt-0.5" style={{ color: tokens.info }} />
        <div>
          <h3 className="font-semibold text-[var(--color-text-primary)]">Scrape transparency</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {summary.sourcesChecked} sources checked · {summary.pricesFound} prices found
            {cacheHits > 0 && ` · ${cacheHits} from disk cache`}
            {liveDownloads > 0 && ` · ${liveDownloads} live`}
          </p>
        </div>
      </div>

      {!hasGaps && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          All major hospital sites in your radius returned usable pricing data.
        </p>
      )}

      {summary.partialIssues.map((item) => (
        <div key={item.name} className="flex gap-2 text-sm text-[var(--color-text-secondary)]">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: tokens.warn }} />
          <span>
            <strong className="text-[var(--color-text-primary)]">{item.name}</strong> — {item.issue}
          </span>
        </div>
      ))}

      {summary.missed.map((item) => (
        <div key={item.name} className="flex gap-2 text-sm text-[var(--color-text-secondary)]">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: tokens.warn }} />
          <span>
            <strong className="text-[var(--color-text-primary)]">{item.name}</strong> — {item.reason}
          </span>
        </div>
      ))}
    </motion.section>
  );
}
