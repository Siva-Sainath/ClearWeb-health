"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Database, MapPin, RefreshCw } from "lucide-react";
import ScrapeCanvas from "@/components/ScrapeCanvas";
import {
  ST_LUKES_HEAL_SHOWCASE,
  TEXAS_COLLECTOR_SNAPSHOT,
} from "@/lib/healShowcase";
import { tokens } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";

function TexasPipelinePanel() {
  const snap = TEXAS_COLLECTOR_SNAPSHOT;
  const asOf = snap.asOf || "2026-08-23";

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-2xl border border-white/[0.08] bg-[var(--color-surface-raised)]/60 p-4 space-y-4 shrink-0 lg:w-80"
    >
      <div className="flex items-start gap-2">
        <MapPin size={16} className="shrink-0 mt-0.5" style={{ color: tokens.accent }} />
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Texas collector pipeline
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
            Real Bright Data Scraper Studio collectors queued statewide — snapshot as of{" "}
            {new Date(asOf).toLocaleDateString()}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-white/10 py-2 px-1">
          <p className="text-lg font-semibold text-emerald-400">{snap.verified}</p>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">verified</p>
        </div>
        <div className="rounded-xl border border-white/10 py-2 px-1">
          <p className="text-lg font-semibold text-sky-400">{snap.pending}</p>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">pending</p>
        </div>
        <div className="rounded-xl border border-white/10 py-2 px-1">
          <p className="text-lg font-semibold text-amber-400">{snap.failed}</p>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">failed</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-[var(--color-text-tertiary)] flex items-center gap-1.5">
          <Database size={12} />
          Recent collectors
        </p>
        <ul className="space-y-1.5 max-h-40 overflow-y-auto text-[11px]">
          {(snap.recent || []).slice(0, 6).map((job) => (
            <li
              key={job.collectorId}
              className="flex flex-col gap-0.5 py-1.5 border-b border-white/[0.04] last:border-0"
            >
              <span className="text-[var(--color-text-primary)] font-medium truncate">
                {job.hospitalName}
              </span>
              <span className="font-mono text-[var(--color-text-tertiary)] truncate">
                {job.collectorId} · {job.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
        Austin consumer results use verified local MRF cache. This panel shows the separate Texas
        scale-out — honest counts, not fake statewide prices.
      </p>
    </motion.aside>
  );
}

export default function HealShowcasePage() {
  const [replayKey, setReplayKey] = useState(0);
  const data = ST_LUKES_HEAL_SHOWCASE;

  const restartReplay = useCallback(() => {
    setReplayKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-surface)]">
      <header className="shrink-0 border-b border-white/[0.06] px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              <ArrowLeft size={14} />
              Back to Clearweb Health
            </Link>
            <h1 className="text-lg sm:text-xl font-semibold text-[var(--color-text-primary)]">
              Recorded Bright Data self-heal — St. Luke&apos;s Houston
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Collector{" "}
              <code className="font-mono text-xs">{data.collectorId}</code> · captured{" "}
              {new Date(data.capturedAt).toLocaleString()}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs border border-white/10"
            onClick={restartReplay}
          >
            <RefreshCw size={14} className="mr-1.5" />
            Replay again
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-3 sm:p-4 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-3">
        <div className="flex-1 min-h-[480px] lg:min-h-0 rounded-2xl overflow-hidden border border-white/[0.06]" key={replayKey}>
          <ScrapeCanvas
            showcaseMode={{
              replayEvents: data.replayEvents,
              healLog: data.healLog,
              facilityName: data.facility.name,
              collectorId: data.collectorId,
              headerLabel: "St. Luke's Houston · BD self-heal",
              bannerLabel: "Texas collector self-heal replay",
            }}
          />
        </div>
        <TexasPipelinePanel />
      </main>
    </div>
  );
}
