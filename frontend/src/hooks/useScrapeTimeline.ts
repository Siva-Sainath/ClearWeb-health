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
  onTimelineComplete?: () => void;
  onHealEvent?: (log: ScraperLog) => void;
}

export function useScrapeTimeline({
  mode,
  active,
  events = [],
  jobId = null,
  speedMultiplier = 8,
  onTimelineComplete,
  onHealEvent,
}: UseScrapeTimelineOptions): ScrapeTimelineState {
  const [nodes, setNodes] = useState<SourceNode[]>(INITIAL_NODES);
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

  const completedRef = useRef(new Set<string>());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mitigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onTimelineComplete);
  const onHealRef = useRef(onHealEvent);

  useEffect(() => {
    onCompleteRef.current = onTimelineComplete;
    onHealRef.current = onHealEvent;
  }, [onTimelineComplete, onHealEvent]);

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

  const applyLog = useCallback(
    (log: ScraperLog) => {
      const nodeId = resolveScrapeNodeId(log);
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
          onHealRef.current?.(log);
          break;
        case "heal_resumed":
          setHealingNode(null);
          setActiveNode(nodeId);
          updateStatus(nodeId, "active");
          showMitigation("Healed — retrying extraction");
          break;
        case "heal_failed":
          setHealingNode(null);
          setActiveNode(nodeId);
          updateStatus(nodeId, "broken");
          setBrokenNodes((prev) => new Set(prev).add(nodeId));
          showMitigation("Self-heal exhausted");
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
    [showMitigation, updateStatus]
  );

  const finishTimeline = useCallback(() => {
    setActiveNode(null);
    setHealingNode(null);
    setMitigationLabel(null);
    completedRef.current = new Set(INITIAL_NODES.map((n) => n.id));
    setCompletedCount(HOSPITAL_NODE_COUNT);
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        status: n.status === "broken" ? "broken" : "complete",
      }))
    );
    setTimelineComplete(true);
    onCompleteRef.current?.();
  }, []);

  const resetTimeline = useCallback(() => {
    clearTimers();
    completedRef.current = new Set();
    startedAtRef.current = Date.now();
    setNodes(INITIAL_NODES.map((n) => ({ ...n, status: "idle" as NodeStatus })));
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
  }, [clearTimers]);

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

    sorted.forEach((log, i) => {
      const eventTime = new Date(log.ts).getTime();
      const delayMs = Math.max(100, (eventTime - t0) / speedMultiplier + i * 35);
      const timer = setTimeout(() => applyLog(log), delayMs);
      timersRef.current.push(timer);
    });

    const totalDelay =
      sorted.length > 0
        ? Math.max(2000, (new Date(sorted[sorted.length - 1].ts).getTime() - t0) / speedMultiplier + 1200)
        : 2000;

    const doneTimer = setTimeout(() => finishTimeline(), totalDelay);
    timersRef.current.push(doneTimer);

    return () => {
      clearInterval(tick);
      clearTimers();
    };
  }, [mode, active, events, speedMultiplier, applyLog, finishTimeline, resetTimeline, clearTimers]);

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
    totalNodes: HOSPITAL_NODE_COUNT,
    cacheHits,
    liveDownloads,
    failureCount,
    healCount,
    elapsedSec,
    isLiveScraping,
    isCacheOnly,
    timelineComplete,
    isReplay: mode === "replay",
  };
}
