"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, CheckCircle2, Terminal, Wrench, XCircle } from "lucide-react";
import type { ScraperLog } from "@/lib/types";
import type { HealLogStep } from "@/lib/healShowcase";
import { tokens } from "@/lib/design-tokens";

interface SelfHealCinematicProps {
  active: boolean;
  healEvent: ScraperLog | null;
  healLog?: HealLogStep[];
  collectorId?: string;
  facilityName?: string;
}

function productBadge(detail: string): string | null {
  if (/refactor|planner|code_fixer/i.test(detail)) return "Scraper Studio · Self-Heal";
  if (/unlocker/i.test(detail)) return "Web Unlocker";
  if (/tier/i.test(detail)) return "Self-Heal Tier";
  return "Bright Data Self-Heal";
}

export default function SelfHealCinematic({
  active,
  healEvent,
  healLog = [],
  collectorId,
  facilityName,
}: SelfHealCinematicProps) {
  const [visibleSteps, setVisibleSteps] = useState<HealLogStep[]>([]);

  useEffect(() => {
    if (!active) {
      setVisibleSteps([]);
      return;
    }
    setVisibleSteps([]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    healLog.forEach((step, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleSteps((prev) => [...prev, step]);
        }, 400 + i * 900)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [active, healLog]);

  const isFailed = healEvent?.event === "heal_failed";
  const isResumed = healEvent?.event === "heal_resumed";
  const badge = healEvent?.detail ? productBadge(healEvent.detail) : "Bright Data Self-Heal";

  return (
    <AnimatePresence>
      {active && healEvent && (
        <motion.div
          key={healEvent.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0 }}
            className="w-full max-w-lg rounded-2xl border border-sky-500/30 bg-slate-950/95 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-start gap-3">
              <div
                className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${tokens.info}22` }}
              >
                <Wrench size={20} style={{ color: tokens.info }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-sky-400/90">
                  Self-healing in progress
                </p>
                <h2 className="text-lg font-semibold text-white mt-0.5 truncate">
                  {facilityName || healEvent.facility_name || "Hospital collector"}
                </h2>
                <p className="text-xs text-white/50 mt-1 font-mono truncate">
                  {collectorId || healEvent.collector_id}
                </p>
              </div>
              <span className="shrink-0 badge text-[10px] border-sky-500/40 text-sky-200 bg-sky-950/80">
                {badge}
              </span>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-white/80 leading-relaxed">{healEvent.detail}</p>

              {healLog.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 text-xs text-white/50">
                    <Terminal size={12} />
                    Recorded heal steps (from heal_log.jsonl)
                  </div>
                  <div className="max-h-36 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px]">
                    {visibleSteps.map((step) => (
                      <div key={`${step.ts}-${step.step}`} className="flex gap-2 text-white/70">
                        <span className="text-sky-400/80 shrink-0">{step.step}</span>
                        <span className="min-w-0 break-all">{step.message}</span>
                      </div>
                    ))}
                    {visibleSteps.length === 0 && (
                      <span className="text-white/40 animate-pulse">Streaming heal trace…</span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-white/50">
                {isFailed ? (
                  <>
                    <XCircle size={14} className="text-amber-400 shrink-0" />
                    Honest outcome: preview gate rejected — no fake prices shown
                  </>
                ) : isResumed ? (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    Refactor applied — retrying extraction
                  </>
                ) : (
                  <>
                    <Activity size={14} className="text-sky-400 shrink-0 animate-pulse" />
                    Replay slowed to 1× for this heal moment
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
