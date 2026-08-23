"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Copy, Check, Database, Shield } from "lucide-react";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { ScraperLog } from "@/lib/types";
import { tokens } from "@/lib/design-tokens";

interface HealEventSummary {
  timestamp?: string;
  collector_id?: string;
  reason?: string;
  success?: boolean;
}

interface ScrapeTrustPanelProps {
  summary: ScrapeExecutiveSummary;
  cacheHits?: number;
  liveDownloads?: number;
  lastUpdated?: string | null;
  collectorIds?: string[];
  healEvents?: HealEventSummary[];
  scrapeEvents?: ScraperLog[];
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      onClick={() => {
        void navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {id}
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

export default function ScrapeTrustPanel({
  summary,
  cacheHits = 0,
  liveDownloads = 0,
  lastUpdated,
  collectorIds = [],
  healEvents = [],
  scrapeEvents = [],
}: ScrapeTrustPanelProps) {
  const hasGaps = summary.missed.length > 0 || summary.partialIssues.length > 0;

  const idsFromEvents = [
    ...new Set(
      scrapeEvents.map((e) => e.collector_id).filter((id): id is string => !!id)
    ),
  ];
  const idsFromHeal = [
    ...new Set(
      healEvents.map((e) => e.collector_id).filter((id): id is string => !!id)
    ),
  ];
  const allCollectorIds = [
    ...new Set([...collectorIds, ...idsFromEvents, ...idsFromHeal]),
  ].slice(0, 8);
  const healCount = healEvents.filter((e) => e.success).length;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 space-y-4 border border-amber-500/15"
    >
      <div className="flex items-start gap-3">
        <Shield size={18} className="shrink-0 mt-0.5" style={{ color: tokens.accent }} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Bright Data platform proof</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Scraper Studio · Web Unlocker · Self-Healing
          </p>
          {lastUpdated && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              Last verified {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Database size={16} className="shrink-0 mt-0.5" style={{ color: tokens.info }} />
        <p className="text-sm text-[var(--color-text-secondary)]">
          {summary.sourcesChecked} sources checked · {summary.pricesFound} prices found
          {cacheHits > 0 && ` · ${cacheHits} disk cache`}
          {liveDownloads > 0 && ` · ${liveDownloads} Unlocker live`}
          {healCount > 0 && ` · ${healCount} self-heal recovery`}
        </p>
      </div>

      {allCollectorIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)]">Collector IDs (c_*)</p>
          <div className="flex flex-wrap gap-2">
            {allCollectorIds.map((id) => (
              <span key={id} className="badge badge-neutral px-2 py-1">
                <CopyId id={id} />
              </span>
            ))}
          </div>
        </div>
      )}

      {healEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)]">Recent heal events</p>
          {healEvents.slice(0, 3).map((evt, i) => (
            <div
              key={`${evt.collector_id}-${i}`}
              className="text-xs text-[var(--color-text-secondary)] flex gap-2 items-start"
            >
              <span
                className="shrink-0 badge text-[10px]"
                style={{
                  color: evt.success ? tokens.accent : tokens.warn,
                  borderColor: evt.success ? tokens.accentBorder : undefined,
                }}
              >
                {evt.success ? "healed" : "needs_human"}
              </span>
              <span className="min-w-0">
                <span className="font-mono">{evt.collector_id}</span>
                {evt.reason && ` — ${evt.reason.slice(0, 80)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {!hasGaps && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          All major hospital sites in your radius returned usable CMS price file data.
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
