"use client";

/**
 * Replays stored scrape events on ScrapeCanvas with a time multiplier (demo summary animation).
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

export interface ScrapeReplayOptions {
  events: ScraperLog[];
  speedMultiplier?: number;
  active: boolean;
  onComplete?: () => void;
}

export function useScrapeReplay({
  events,
  speedMultiplier = 8,
  active,
  onComplete,
}: ScrapeReplayOptions) {
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
  const completedRef = useRef(new Set<string>());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mitigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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

  useEffect(() => {
    if (!active || events.length === 0) return;

    clearTimers();
    completedRef.current = new Set();
    setCompletedCount(0);
    setCacheHits(0);
    setLiveDownloads(0);
    setFailureCount(0);
    setHealCount(0);
    setBrokenNodes(new Set());
    setMitigationLabel(null);
    setElapsedSec(0);
    startedAtRef.current = Date.now();
    setNodes(INITIAL_NODES.map((n) => ({ ...n, status: "idle" as NodeStatus })));
    setLogs([]);
    setActiveNode(null);
    setHealingNode(null);

    const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    const t0 = new Date(sorted[0]?.ts ?? Date.now()).getTime();

    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    sorted.forEach((log, i) => {
      const nodeId = resolveScrapeNodeId(log);
      if (!nodeId) return;

      const eventTime = new Date(log.ts).getTime();
      const delayMs = Math.max(
        100,
        (eventTime - t0) / speedMultiplier + i * 35
      );

      const timer = setTimeout(() => {
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
            const detail = log.detail || "";
            if (/unlocker/i.test(detail)) {
              showMitigation("Mitigation: Bright Data Web Unlocker retry");
            } else if (/fresh.*collector/i.test(detail)) {
              showMitigation("Mitigation: new Scraper Studio collector");
            } else if (/tier/i.test(detail)) {
              showMitigation("Mitigation: self-healing scraper tier");
            } else {
              showMitigation("Mitigation: self-healing scraper");
            }
            break;
          case "heal_resumed":
            setHealingNode(null);
            setActiveNode(nodeId);
            updateStatus(nodeId, "active");
            showMitigation("Healed — retrying extraction");
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
      }, delayMs);

      timersRef.current.push(timer);
    });

    const totalDelay =
      sorted.length > 0
        ? Math.max(
            2000,
            (new Date(sorted[sorted.length - 1].ts).getTime() - t0) / speedMultiplier + 1200
          )
        : 2000;

    const doneTimer = setTimeout(() => {
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
      onCompleteRef.current?.();
    }, totalDelay);
    timersRef.current.push(doneTimer);

    return () => {
      clearInterval(tick);
      clearTimers();
    };
  }, [active, events, speedMultiplier, clearTimers, updateStatus, showMitigation]);

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
    isReplay: true,
  };
}

export { CX, CY };
