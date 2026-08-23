"use client";

/**
 * useScrapeTimeline — shared event→node reducer for live SSE and replay modes.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { SourceNode, ScraperLog, NodeStatus } from "@/lib/types";
import {
  CX,
  CY,
  INITIAL_NODES,
  HOSPITAL_NODE_COUNT,
  resolveScrapeNodeId,
} from "@/lib/austinNodes";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export { CX, CY, INITIAL_NODES, HOSPITAL_NODE_COUNT };

export type ScrapeTimelineMode = "live" | "replay";

export interface ScrapeTimelineState {
  nodes: SourceNode[];
  logs: ScraperLog[];
  activeNode: string | null;
  healingNode: string | null;
  brokenNodes: Set<string>;
  mitigationLabel: string | null;
  completedCount: number;
  totalNodes: number;
  cacheHits: number;
  liveDownloads: number;
  failureCount: number;
  healCount: number;
  elapsedSec: number;
  isLiveScraping: boolean;
  isCacheOnly: boolean;
  timelineComplete: boolean;
  isReplay: boolean;
  /** Active heal event for cinematic overlay (replay + live). */
  activeHealEvent: ScraperLog | null;
  healDwellActive: boolean;
}

function mitigationForHeal(detail: string): string {
  if (/unlocker/i.test(detail)) return "Mitigation: Bright Data Web Unlocker retry";
  if (/fresh.*collector/i.test(detail)) return "Mitigation: new Scraper Studio collector";
  if (/tier/i.test(detail)) return "Mitigation: self-healing scraper tier";
  return "Mitigation: self-healing scraper";
}

function parseStreamPayload(data: Record<string, unknown>): ScraperLog | null {
  const nodeId = resolveScrapeNodeId(data as unknown as ScraperLog);
  if (!nodeId) return null;
  return {
    id: (data.id as string) || `evt-${Date.now()}`,
    ts: (data.ts as string) || new Date().toISOString(),
    collector_id: (data.brightdata_collector_id as string) || (data.collector_id as string) || "",
    event: data.event as ScraperLog["event"],
    facility_name: (data.facility_name as string) || "",
    cpt_code: (data.cpt_code as string) || "",
    cash_price: data.cash_price as number | undefined,
    insurance_rate: data.insurance_rate as number | undefined,
    network: (data.network as string) || "",
    detail: (data.detail as string) || "",
    discovery_source: data.discovery_source as string | undefined,
    cache_hit: data.cache_hit as boolean | undefined,
    download_source: data.download_source as string | undefined,
    node_id: data.node_id as string | undefined,
    hospital_id: data.hospital_id as string | undefined,
  };
}

export interface UseScrapeTimelineOptions {
  mode: ScrapeTimelineMode;
  active: boolean;
  /** Replay buffer (required for replay mode). */
  events?: ScraperLog[];
  /** Live job id (required for live mode). */
  jobId?: string | null;
  speedMultiplier?: number;
  /** Slow replay at heal moments and show cinematic overlay. */
  healCinematicEnabled?: boolean;
  /** Extra dwell time (ms) inserted after each heal_triggered in replay. */
  healDwellMs?: number;
  /** Override graph nodes (e.g. single-hospital showcase). */
  initialNodes?: SourceNode[];
  /** Custom node resolver for showcase replays. */
  resolveNodeId?: (log: ScraperLog) => string | null;
  onTimelineComplete?: () => void;
  onHealEvent?: (log: ScraperLog) => void;
  onProcessEvent?: (log: ScraperLog) => void;
}

export function useScrapeTimeline({
  mode,
  active,
  events = [],
  jobId = null,
  speedMultiplier = 8,
  healCinematicEnabled = false,
  healDwellMs = 16000,
  initialNodes,
  resolveNodeId,
  onTimelineComplete,
  onHealEvent,
  onProcessEvent,
}: UseScrapeTimelineOptions): ScrapeTimelineState {
  const baseNodes = initialNodes ?? INITIAL_NODES;
  const [nodes, setNodes] = useState<SourceNode[]>(baseNodes);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [healingNode, setHealingNode] = useState<string | null>(null);
  const [brokenNodes, setBrokenNodes] = useState<Set<string>>(new Set());
  const [mitigationLabel, setMitigationLabel] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [cacheHits, setCacheHits] = useState(0);
  const [liveDownloads, setLiveDownloads] = useState(0);
  const [failureCount, setFailureCount] = useState(0);
  const [healCount, setHealCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timelineComplete, setTimelineComplete] = useState(false);
  const [activeHealEvent, setActiveHealEvent] = useState<ScraperLog | null>(null);
  const [healDwellActive, setHealDwellActive] = useState(false);

  const completedRef = useRef(new Set<string>());
  const healDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mitigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onTimelineComplete);
  const onHealRef = useRef(onHealEvent);
  const onProcessRef = useRef(onProcessEvent);

  useEffect(() => {
    onCompleteRef.current = onTimelineComplete;
    onHealRef.current = onHealEvent;
    onProcessRef.current = onProcessEvent;
  }, [onTimelineComplete, onHealEvent, onProcessEvent]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    if (mitigationTimerRef.current) clearTimeout(mitigationTimerRef.current);
  }, []);

  const updateStatus = useCallback((id: string, status: NodeStatus) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
  }, []);

  const showMitigation = useCallback((label: string) => {
    setMitigationLabel(label);
    if (mitigationTimerRef.current) clearTimeout(mitigationTimerRef.current);
    mitigationTimerRef.current = setTimeout(() => setMitigationLabel(null), 2800);
  }, []);

  const resolveLogNodeId = useCallback(
    (log: ScraperLog) => {
      if (resolveNodeId) {
        const custom = resolveNodeId(log);
        if (custom) return custom;
      }
      if (log.node_id && nodes.some((n) => n.id === log.node_id)) {
        return log.node_id;
      }
      return resolveScrapeNodeId(log);
    },
    [resolveNodeId, nodes]
  );

  const beginHealDwell = useCallback(
    (log: ScraperLog) => {
      if (!healCinematicEnabled) return;
      setActiveHealEvent(log);
      setHealDwellActive(true);
      if (healDwellTimerRef.current) clearTimeout(healDwellTimerRef.current);
      healDwellTimerRef.current = setTimeout(() => {
        setHealDwellActive(false);
        setActiveHealEvent(null);
      }, healDwellMs);
    },
    [healCinematicEnabled, healDwellMs]
  );

  const applyLog = useCallback(
    (log: ScraperLog) => {
      onProcessRef.current?.(log);
      const nodeId = resolveLogNodeId(log);
      if (!nodeId) return;

      setLogs((prev) => [log, ...prev].slice(0, 60));

      if (log.event === "mrf_downloaded") {
        if (log.cache_hit) setCacheHits((c) => c + 1);
        else setLiveDownloads((c) => c + 1);
      }

      switch (log.event) {
        case "collector_started":
        case "page_loaded":
          setActiveNode(nodeId);
          updateStatus(nodeId, "active");
          break;
        case "mrf_downloaded":
          setActiveNode(nodeId);
          updateStatus(nodeId, "active");
          setBrokenNodes((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
          });
          break;
        case "extraction_failed":
        case "rate_limited":
          setFailureCount((c) => c + 1);
          setActiveNode(nodeId);
          updateStatus(nodeId, "broken");
          setBrokenNodes((prev) => new Set(prev).add(nodeId));
          break;
        case "heal_triggered":
          setHealCount((c) => c + 1);
          setHealingNode(nodeId);
          setActiveNode(nodeId);
          updateStatus(nodeId, "healing");
          showMitigation(mitigationForHeal(log.detail || ""));
          beginHealDwell(log);
          onHealRef.current?.(log);
          break;
        case "heal_resumed":
          setHealingNode(null);
          setActiveNode(nodeId);
          updateStatus(nodeId, "active");
          showMitigation("Healed — retrying extraction");
          if (healCinematicEnabled) beginHealDwell(log);
          break;
        case "heal_failed":
          setHealingNode(null);
          setActiveNode(nodeId);
          updateStatus(nodeId, "broken");
          setBrokenNodes((prev) => new Set(prev).add(nodeId));
          showMitigation("Self-heal exhausted");
          if (healCinematicEnabled) beginHealDwell(log);
          onHealRef.current?.(log);
          break;
        case "price_extracted":
          updateStatus(nodeId, "complete");
          setHealingNode(null);
          setBrokenNodes((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
          });
          if (!completedRef.current.has(nodeId)) {
            completedRef.current.add(nodeId);
            setCompletedCount(completedRef.current.size);
          }
          setActiveNode(nodeId);
          setTimeout(() => setActiveNode(null), 500);
          break;
        default:
          setActiveNode(nodeId);
          updateStatus(nodeId, "active");
      }
    },
    [showMitigation, updateStatus, resolveLogNodeId, beginHealDwell, healCinematicEnabled]
  );

  const finishTimeline = useCallback(() => {
    setActiveNode(null);
    setHealingNode(null);
    setMitigationLabel(null);
    completedRef.current = new Set(baseNodes.map((n) => n.id));
    setCompletedCount(baseNodes.length);
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        status: n.status === "broken" ? "broken" : "complete",
      }))
    );
    setTimelineComplete(true);
    onCompleteRef.current?.();
  }, [baseNodes]);

  const resetTimeline = useCallback(() => {
    clearTimers();
    if (healDwellTimerRef.current) clearTimeout(healDwellTimerRef.current);
    completedRef.current = new Set();
    startedAtRef.current = Date.now();
    setNodes(baseNodes.map((n) => ({ ...n, status: "idle" as NodeStatus })));
    setLogs([]);
    setActiveNode(null);
    setHealingNode(null);
    setCompletedCount(0);
    setCacheHits(0);
    setLiveDownloads(0);
    setFailureCount(0);
    setHealCount(0);
    setBrokenNodes(new Set());
    setMitigationLabel(null);
    setElapsedSec(0);
    setTimelineComplete(false);
    setActiveHealEvent(null);
    setHealDwellActive(false);
  }, [clearTimers, baseNodes]);

  // Replay mode
  useEffect(() => {
    if (mode !== "replay" || !active) return;

    resetTimeline();

    if (events.length === 0) {
      const doneTimer = setTimeout(() => finishTimeline(), 1500);
      timersRef.current.push(doneTimer);
      return () => clearTimers();
    }

    const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    const t0 = new Date(sorted[0]?.ts ?? Date.now()).getTime();

    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    let healDwellExtra = 0;
    sorted.forEach((log, i) => {
      const eventTime = new Date(log.ts).getTime();
      const baseDelay = Math.max(100, (eventTime - t0) / speedMultiplier + i * 35);
      const delayMs = baseDelay + healDwellExtra;
      const timer = setTimeout(() => applyLog(log), delayMs);
      timersRef.current.push(timer);
      if (healCinematicEnabled && log.event === "heal_triggered") {
        healDwellExtra += healDwellMs;
      }
    });

    const totalDelay =
      sorted.length > 0
        ? Math.max(
            2000,
            (new Date(sorted[sorted.length - 1].ts).getTime() - t0) / speedMultiplier + healDwellExtra + 1200
          )
        : 2000;

    const doneTimer = setTimeout(() => finishTimeline(), totalDelay);
    timersRef.current.push(doneTimer);

    return () => {
      clearInterval(tick);
      clearTimers();
    };
  }, [
    mode,
    active,
    events,
    speedMultiplier,
    healCinematicEnabled,
    healDwellMs,
    applyLog,
    finishTimeline,
    resetTimeline,
    clearTimers,
  ]);

  // Live SSE mode
  useEffect(() => {
    if (mode !== "live" || !active || !jobId) return;

    resetTimeline();
    const url = `${BACKEND}/api/scrape/${jobId}/events`;
    const es = new EventSource(url);

    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as Record<string, unknown>;
        if (data.type === "complete" || data.type === "failed" || data.type === "cancelled") {
          es.close();
          if (data.stats && typeof data.stats === "object") {
            const stats = data.stats as { cacheHits?: number; liveDownloads?: number };
            if (stats.cacheHits != null) setCacheHits(stats.cacheHits);
            if (stats.liveDownloads != null) setLiveDownloads(stats.liveDownloads);
          }
          finishTimeline();
          return;
        }
        const log = parseStreamPayload(data);
        if (log) applyLog(log);
      } catch {
        /* ignore malformed */
      }
    };

    es.onerror = () => es.close();

    return () => {
      clearInterval(tick);
      es.close();
      clearTimers();
    };
  }, [mode, active, jobId, applyLog, finishTimeline, resetTimeline, clearTimers]);

  const isLiveScraping = liveDownloads > 0;
  const isCacheOnly = cacheHits > 0 && liveDownloads === 0 && completedCount > 0;

  return {
    nodes,
    logs,
    activeNode,
    healingNode,
    brokenNodes,
    mitigationLabel,
    completedCount,
    totalNodes: nodes.length,
    cacheHits,
    liveDownloads,
    failureCount,
    healCount,
    elapsedSec,
    isLiveScraping,
    isCacheOnly,
    timelineComplete,
    isReplay: mode === "replay",
    activeHealEvent,
    healDwellActive,
  };
}
