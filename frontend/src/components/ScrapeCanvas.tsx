"use client";

import React, { useCallback, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
  XCircle,
  Database,
  Radio,
  Info,
  Film,
} from "lucide-react";
import { useScrapeTimeline, CX, CY } from "@/hooks/useScrapeTimeline";
import { useScrapeOrchestrator } from "@/hooks/useScrapeOrchestrator";
import { useScrapeJob } from "@/hooks/useScrapeJob";
import { healLineFromLog, useScrapeNarration } from "@/hooks/useScrapeNarration";
import { useAppContext } from "@/context/AppContext";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { resetVoiceQueue } from "@/lib/ttsSpeak";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { tokens } from "@/lib/design-tokens";
import type { ScraperLog } from "@/lib/types";
import { nodeDisplayLabel } from "@/lib/austinNodes";
import { Button } from "@/components/ui/button";

const NODE_STROKE: Record<string, string> = {
  idle: tokens.textTertiary,
  active: tokens.accent,
  complete: tokens.accent,
  broken: tokens.warn,
  healing: tokens.info,
};

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

function buildStrands(nx: number, ny: number): string {
  const dx = nx - CX;
  const dy = ny - CY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const sag = len * 0.14;
  const c1x = CX + dx * 0.33 + perpX * sag;
  const c1y = CY + dy * 0.33 + perpY * sag;
  const c2x = CX + dx * 0.66 + perpX * sag;
  const c2y = CY + dy * 0.66 + perpY * sag;
  return `M${CX},${CY} C${c1x},${c1y} ${c2x},${c2y} ${nx},${ny}`;
}

function CrawlerDot({
  x,
  y,
  angle,
  reducedMotion,
}: {
  x: number;
  y: number;
  angle: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.g
      animate={{ x, y, rotate: angle }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
    >
      <circle r={6} fill={tokens.surfaceRaised} stroke={tokens.accent} strokeWidth={2} />
      <circle r={2} fill={tokens.accent} />
    </motion.g>
  );
}

function discoveryLabel(source?: string): string | null {
  if (!source) return null;
  const map: Record<string, string> = {
    collector: "Scraper Studio",
    http_discover: "Web Unlocker",
    brightdata_unlocker: "Web Unlocker",
    seed: "Verified URL",
    healed: "Self-Healing",
    cache_skip_collector: "Disk cache (skipped collector)",
  };
  return map[source] ?? source;
}

function eventLabel(log: ScraperLog): string {
  switch (log.event) {
    case "price_extracted":
      return "Price matched from MRF";
    case "collector_started":
      return log.detail || "Starting Bright Data collector…";
    case "page_loaded":
      return log.detail || "MRF URL discovered";
    case "mrf_downloaded":
      return log.cache_hit
        ? "Loaded from disk cache (real MRF file)"
        : "Live download via Web Unlocker";
    case "rate_limited":
      return "Site slow — retrying";
    case "extraction_failed":
      return log.detail || "Extraction failed — site layout or parse error";
    case "heal_triggered":
      return log.detail || "Self-healing scraper engaged";
    case "heal_resumed":
      return log.detail || "Heal complete — retrying";
    case "heal_failed":
      return log.detail || "Self-heal exhausted";
    default:
      return log.detail || log.event;
  }
}

function TimelineRow({ log }: { log: ScraperLog }) {
  const isPrice = log.event === "price_extracted";
  const isFail = log.event === "extraction_failed" || log.event === "rate_limited";
  const isHeal = log.event === "heal_triggered" || log.event === "heal_resumed" || log.event === "heal_failed";
  const isCache = log.event === "mrf_downloaded" && log.cache_hit;
  const isLive = log.event === "mrf_downloaded" && !log.cache_hit;
  const time = log.ts.split("T")[1]?.substring(0, 8) ?? "";
  const src = discoveryLabel(log.discovery_source);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-xl p-3 ${isHeal ? "ring-1 ring-[var(--color-info)]/40 bg-[var(--color-info)]/5" : ""} ${isFail ? "ring-1 ring-[var(--color-warn)]/40 bg-red-950/20" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        {isPrice ? (
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: tokens.accent }} />
        ) : isFail ? (
          <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: tokens.warn }} />
        ) : isHeal ? (
          <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" style={{ color: tokens.info }} />
        ) : isLive ? (
          <Radio size={14} className="mt-0.5 shrink-0 animate-pulse" style={{ color: tokens.accent }} />
        ) : isCache ? (
          <Database size={14} className="mt-0.5 shrink-0" style={{ color: tokens.warn }} />
        ) : (
          <Loader2 size={14} className="text-[var(--color-text-tertiary)] mt-0.5 shrink-0 animate-spin" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {log.facility_name || log.detail || eventLabel(log)}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] shrink-0">{time}</span>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 line-clamp-2">{eventLabel(log)}</p>
          {isFail && (
            <p className="text-[10px] text-amber-300/90 mt-1">→ self-healing or Web Unlocker may follow</p>
          )}
          {src && (
            <span className="inline-block mt-1 text-[10px] badge badge-neutral">{src}</span>
          )}
          {log.collector_id && (
            <span className="inline-block mt-1 ml-1 text-[10px] font-mono badge badge-neutral">
              {log.collector_id}
            </span>
          )}
          {isPrice && log.insurance_rate != null && (
            <div className="glass-accent mt-2 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-secondary)]">Your plan estimate</span>
              <span className="text-lg font-semibold" style={{ color: tokens.accent }}>
                ${log.insurance_rate}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ScrapeModeBanner({
  isLiveScraping,
  isCacheOnly,
  isReplay,
  cacheHits,
  liveDownloads,
  elapsedSec,
  failureCount = 0,
  healCount = 0,
  priceCount = 0,
}: {
  isLiveScraping: boolean;
  isCacheOnly: boolean;
  isReplay?: boolean;
  cacheHits: number;
  liveDownloads: number;
  elapsedSec: number;
  failureCount?: number;
  healCount?: number;
  priceCount?: number;
}) {
  if (isReplay) {
    return (
      <div className="flex flex-col gap-1.5 text-xs rounded-lg px-3 py-2 border border-violet-500/25 bg-violet-950/30">
        <div className="flex flex-wrap items-center gap-2">
          <Film size={14} className="text-violet-300" />
          <span className="text-violet-100 font-medium">Verified replay — real scrape events</span>
          <span className="text-violet-300/80 text-xs">(8× speed · not a live run)</span>
          <span className="text-violet-200/80">Fast-forward · {formatElapsed(elapsedSec)}</span>
        </div>
        {(failureCount > 0 || healCount > 0) && (
          <p className="text-violet-200/90 pl-5">
            {failureCount > 0 && `${failureCount} failure${failureCount > 1 ? "s" : ""}`}
            {failureCount > 0 && healCount > 0 && " · "}
            {healCount > 0 && `${healCount} self-heal mitigations`}
            {priceCount > 0 && ` · ${priceCount} prices extracted`}
          </p>
        )}
      </div>
    );
  }
  if (isLiveScraping) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/25 text-sm">
        <Radio size={14} className="text-emerald-400 animate-pulse shrink-0" />
        <span className="text-emerald-100 font-medium">Live scrape</span>
        <span className="text-emerald-300/80 text-xs">(Bright Data SSE)</span>
        <span className="text-emerald-200/70 text-xs">
          {liveDownloads} live download{liveDownloads !== 1 ? "s" : ""} · {formatElapsed(elapsedSec)}
        </span>
      </div>
    );
  }
  if (cacheHits > 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-950/30 border border-amber-500/20 text-sm">
        <Database size={14} className="text-amber-400 shrink-0" />
        <span className="text-amber-100 font-medium">
          {isCacheOnly ? "Demo cache mode" : "Mixed: cache + live"}
        </span>
        <span className="text-amber-200/70 text-xs">
          {cacheHits} cached · {liveDownloads} live · real MRF data, not simulated
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-[var(--color-text-secondary)]">
      <Loader2 size={14} className="animate-spin shrink-0" />
      <span>Connecting to hospital price pages… {formatElapsed(elapsedSec)}</span>
    </div>
  );
}

function BrightDataExplainer() {
  return (
    <details className="glass rounded-xl text-xs text-[var(--color-text-secondary)]">
      <summary className="cursor-pointer px-3 py-2.5 flex items-center gap-2 font-medium text-[var(--color-text-primary)] list-none">
        <Info size={13} className="shrink-0 text-[var(--color-text-tertiary)]" />
        Why Scraper Studio + Web Unlocker?
      </summary>
      <div className="px-3 pb-3 space-y-2 leading-relaxed border-t border-white/[0.06] pt-2">
        <p>
          <strong className="text-[var(--color-text-primary)]">Scraper Studio</strong> navigates each
          hospital&apos;s price-transparency portal and finds the CMS machine-readable file (MRF) URL.
        </p>
        <p>
          <strong className="text-[var(--color-text-primary)]">Web Unlocker</strong> downloads the actual
          MRF bytes (JSON/CSV) through bot protection — we never fake prices.
        </p>
        <p>
          <strong className="text-[var(--color-text-primary)]">BD functions</strong> (
          <code className="font-mono text-[10px]">navigate</code>,{" "}
          <code className="font-mono text-[10px]">tag_download</code>, etc.) are low-level browser steps
          inside collectors — not a separate API we call. They power Studio, not replace Unlocker.
        </p>
        <p className="text-[var(--color-text-tertiary)]">
          Disk cache reuses previously downloaded MRF files for demo reliability; prices still come from
          those real published files.
        </p>
      </div>
    </details>
  );
}

export default function ScrapeCanvas() {
  const {
    scrapeStatus,
    patientProfile,
    scrapeJobId,
    scrapePresentationMode,
    replayEvents,
    executiveSummary,
    journeyPhase,
    setJourneyPhase,
    setScrapeStatus,
    setIsSpeaking,
    setLastAgentMessage,
  } = useAppContext();
  const { cancelScrape } = useScrapeJob();

  const isProofReel =
    scrapePresentationMode === "proof-reel" || scrapePresentationMode === "replay";
  const isLive = scrapePresentationMode === "live";
  const isAnimating = scrapeStatus === "running" && (isProofReel || isLive);

  const [narrationComplete, setNarrationComplete] = useState(false);
  const [narrationCaption, setNarrationCaption] = useState("");
  const [pendingHealLine, setPendingHealLine] = useState<string | null>(null);

  useEffect(() => {
    if (isAnimating) {
      setNarrationComplete(false);
      setPendingHealLine(null);
    }
  }, [isAnimating, scrapePresentationMode, scrapeJobId]);

  const goToResults = useCallback(() => {
    setScrapeStatus("complete");
    setJourneyPhase("results");
  }, [setJourneyPhase, setScrapeStatus]);

  const handleHealEvent = useCallback((log: ScraperLog) => {
    setPendingHealLine(healLineFromLog(log));
  }, []);

  const timelineActive =
    isAnimating && (isLive || replayEvents.length > 0);

  const timeline = useScrapeTimeline({
    mode: isLive ? "live" : "replay",
    active: timelineActive,
    events: replayEvents,
    jobId: scrapeJobId,
    speedMultiplier: 8,
    onHealEvent: handleHealEvent,
  });

  const scrapeComplete = isLive
    ? scrapeStatus === "complete" && timeline.timelineComplete
    : timeline.timelineComplete && replayEvents.length > 0;

  useScrapeNarration({
    active: isAnimating,
    profile: patientProfile,
    summary: executiveSummary,
    scrapeComplete,
    pendingHealLine,
    onHealLineSpoken: () => setPendingHealLine(null),
    onCaption: (line) => {
      setNarrationCaption(line);
      setLastAgentMessage(line);
    },
    onSpeakingChange: setIsSpeaking,
    onFinished: () => setNarrationComplete(true),
  });

  const { forceAdvance } = useScrapeOrchestrator({
    active: isAnimating,
    jobDataReady: isLive ? scrapeStatus === "complete" : true,
    timelineComplete: timeline.timelineComplete,
    narrationComplete,
    scrapeStatus,
    minDurationMs: isProofReel ? 8000 : 0,
    onAdvanceToResults: goToResults,
  });

  const skipToResults = useCallback(() => {
    stopAllVoice();
    resetVoiceQueue();
    setScrapeStatus("complete");
    forceAdvance();
  }, [setScrapeStatus, forceAdvance]);

  const {
    nodes,
    logs,
    activeNode,
    healingNode,
    completedCount,
    totalNodes,
    cacheHits,
    liveDownloads,
    elapsedSec,
    isLiveScraping,
    isCacheOnly,
    failureCount,
    healCount,
    mitigationLabel,
  } = timeline;

  const isReplay = isProofReel;
  const reducedMotion = useReducedMotion();

  const target = activeNode ? nodes.find((n) => n.id === activeNode) : null;
  const avatarX = target?.x ?? CX;
  const avatarY = target?.y ?? CY;
  const angle = target ? Math.atan2(target.y - CY, target.x - CX) * (180 / Math.PI) + 90 : 0;
  const progressPct = totalNodes ? Math.round((completedCount / totalNodes) * 100) : 0;

  return (
    <div className="h-full min-h-0 w-full flex flex-col lg:flex-row gap-3 p-3 sm:p-4 overflow-hidden">
      <div className="flex-[3] min-h-0 min-w-0 relative rounded-2xl overflow-hidden glass flex flex-col">
        <div className="shrink-0 px-4 pt-4 pb-2 flex flex-col gap-2 z-10">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-neutral text-xs">
                {patientProfile.procedure || patientProfile.condition || "Price search"}
              </span>
              <span className="badge badge-neutral text-xs">{patientProfile.insurance}</span>
            </div>
            <div className="flex items-center gap-2">
              {scrapeStatus === "running" && (
                <>
                  <span className="badge badge-live">
                    <span className="badge-dot" />
                    {healingNode ? "Self-healing" : "Scraping Austin hospitals"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs border-red-500/30 text-red-300 hover:bg-red-950/40"
                    onClick={() => {
                      if (isProofReel) {
                        skipToResults();
                      } else {
                        void cancelScrape();
                      }
                    }}
                  >
                    {isProofReel ? "Skip replay" : "Stop job"}
                  </Button>
                </>
              )}
            </div>
          </div>
          {scrapeStatus === "running" && (
            <ScrapeModeBanner
              isLiveScraping={isLiveScraping}
              isCacheOnly={isCacheOnly}
              isReplay={isReplay}
              cacheHits={cacheHits}
              liveDownloads={liveDownloads}
              elapsedSec={elapsedSec}
              failureCount={failureCount}
              healCount={healCount}
              priceCount={completedCount}
            />
          )}
        </div>

        {narrationCaption && isAnimating && (
          <div className="shrink-0 px-4 pb-2 z-10">
            <p
              className="text-sm text-center text-[var(--color-text-secondary)] leading-relaxed px-4 py-3 glass rounded-xl border border-white/[0.06]"
              aria-live="polite"
            >
              {narrationCaption}
            </p>
          </div>
        )}

        <div className="relative flex-1 min-h-[200px] w-full">
          <AnimatePresence>
            {mitigationLabel && (
              <motion.div
                key={mitigationLabel}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[90%] px-4 py-2 rounded-full text-xs font-medium border border-sky-500/40 bg-sky-950/90 text-sky-100 shadow-lg text-center"
              >
                {mitigationLabel}
              </motion.div>
            )}
          </AnimatePresence>
          <svg
            viewBox="0 0 900 560"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {nodes.map((node) => {
              const isActive = node.id === activeNode;
              const isHealing = node.id === healingNode || node.status === "healing";
              const isBroken = node.status === "broken" && !isHealing;
              const stroke = NODE_STROKE[node.status] ?? NODE_STROKE.idle;
              const strandPath = buildStrands(node.x, node.y);
              return (
                <g key={node.id}>
                  <motion.path
                    d={strandPath}
                    fill="none"
                    stroke={
                      isBroken ? tokens.warn : isHealing ? tokens.info : isActive ? tokens.accent : tokens.textTertiary
                    }
                    strokeWidth={isActive || isHealing || isBroken ? 1.5 : 0.75}
                    opacity={isActive || isHealing || isBroken ? 0.55 : 0.15}
                    strokeDasharray={isHealing && !reducedMotion ? "6 4" : undefined}
                    animate={
                      isHealing && !reducedMotion
                        ? { strokeDashoffset: [0, -20] }
                        : isBroken && !reducedMotion
                          ? { opacity: [0.35, 0.7, 0.35] }
                          : { strokeDashoffset: 0 }
                    }
                    transition={
                      isHealing && !reducedMotion
                        ? { duration: 1.2, repeat: Infinity, ease: "linear" }
                        : isBroken && !reducedMotion
                          ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                          : { duration: 0.3 }
                    }
                  />
                  {isHealing && !reducedMotion && (
                    <motion.circle
                      cx={node.x}
                      cy={node.y}
                      r={28}
                      fill="none"
                      stroke={tokens.info}
                      strokeWidth={1}
                      strokeDasharray="4 6"
                      opacity={0.7}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                    />
                  )}
                  {isBroken && !reducedMotion && (
                    <motion.circle
                      cx={node.x}
                      cy={node.y}
                      r={26}
                      fill="none"
                      stroke={tokens.warn}
                      strokeWidth={2}
                      opacity={0.85}
                      animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={26}
                    fill={tokens.surfaceRaised}
                    stroke={stroke}
                    strokeWidth={isActive || isHealing || isBroken ? 2.5 : 1.5}
                  />
                  <text
                    x={node.x}
                    y={node.y - 2}
                    textAnchor="middle"
                    fill={tokens.textPrimary}
                    fontSize={9}
                    fontWeight={600}
                    fontFamily="system-ui, sans-serif"
                  >
                    {nodeDisplayLabel(node)}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + 10}
                    textAnchor="middle"
                    fill={tokens.textTertiary}
                    fontSize={7}
                    fontFamily="ui-monospace, monospace"
                  >
                    {node.domain.replace(/^www\./, "").split(".")[0]}
                  </text>
                </g>
              );
            })}

            <CrawlerDot x={avatarX} y={avatarY} angle={angle} reducedMotion={reducedMotion} />

            <circle cx={CX} cy={CY} r={36} fill={tokens.surface} stroke={tokens.borderBright} strokeWidth={1} />
            <text
              x={CX}
              y={CY + 4}
              textAnchor="middle"
              fill={tokens.textPrimary}
              fontSize={10}
              fontWeight={600}
              fontFamily="system-ui, sans-serif"
            >
              YOU
            </text>
          </svg>
        </div>

        <AnimatePresence>
          {scrapeStatus === "cancelled" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm"
            >
              <div className="glass text-center px-6 py-8 rounded-2xl max-w-sm mx-4 border border-white/[0.1]">
                <XCircle size={32} className="mx-auto mb-3 text-[var(--color-text-secondary)]" />
                <p className="text-lg font-semibold text-[var(--color-text-primary)]">Search stopped</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                  The scrape job was cancelled or timed out. No fake results were shown.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setScrapeStatus("idle");
                    setJourneyPhase("onboarding");
                  }}
                >
                  Start over
                </Button>
              </div>
            </motion.div>
          )}
          {scrapeStatus === "failed" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm"
            >
              <div className="glass text-center px-6 py-8 rounded-2xl max-w-sm mx-4 border border-[var(--color-warn)]/30">
                <AlertCircle size={32} className="mx-auto mb-3" style={{ color: tokens.warn }} />
                <p className="text-lg font-semibold text-[var(--color-text-primary)]">Search interrupted</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                  We could not finish crawling all hospital sites. Try again in a moment.
                </p>
              </div>
            </motion.div>
          )}
          {scrapeStatus === "complete" && journeyPhase === "scraping" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm"
            >
              <div className="glass-accent text-center px-6 py-8 rounded-2xl max-w-sm mx-4">
                <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: tokens.accent }} />
                <p className="text-lg font-semibold text-[var(--color-text-primary)]">Search complete</p>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                  {isReplay
                    ? "Replay finished — returning to your price summary…"
                    : `Found ${completedCount} facilities from real MRF files — preparing your summary…`}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)] mb-1.5">
            <span>
              {completedCount} of {totalNodes} hospital websites
              {cacheHits + liveDownloads > 0 && (
                <span className="ml-2 text-[var(--color-text-secondary)]">
                  · {cacheHits} cached · {liveDownloads} live
                </span>
              )}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: tokens.accentMuted }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: tokens.accent }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      <div className="flex-[2] w-full lg:w-[min(100%,380px)] lg:max-w-[38%] shrink-0 rounded-2xl glass flex flex-col min-h-[220px] lg:min-h-0 max-h-[40vh] lg:max-h-none overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-[var(--color-text-tertiary)]" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">Live capture log</span>
          </div>
          <span className="badge badge-neutral">{logs.length} events</span>
        </div>

        <div className="px-3 pt-2 shrink-0">
          <BrightDataExplainer />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 min-h-0">
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {logs.length > 0
              ? eventLabel(logs[logs.length - 1])
              : "Waiting for Bright Data collectors and MRF downloads"}
          </div>
          {logs.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-8">
              Waiting for Bright Data collectors and MRF downloads…
            </p>
          )}
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <TimelineRow key={log.id} log={log} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
