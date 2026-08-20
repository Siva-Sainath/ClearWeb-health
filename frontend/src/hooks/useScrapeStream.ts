"use client";

/**
 * useScrapeStream — drives ScrapeCanvas from backend scrape job SSE events.
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

export function useScrapeStream(jobId: string | null) {
  const [nodes, setNodes] = useState<SourceNode[]>(INITIAL_NODES);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [healingNode, setHealingNode] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [cacheHits, setCacheHits] = useState(0);
  const [liveDownloads, setLiveDownloads] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const completedRef = useRef(new Set<string>());
  const startedAtRef = useRef<number | null>(null);

  const updateStatus = useCallback((id: string, status: NodeStatus) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
  }, []);

  const addLog = useCallback((log: ScraperLog) => {
    setLogs((prev) => [log, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!jobId) return;

    completedRef.current = new Set();
    setCompletedCount(0);
    setCacheHits(0);
    setLiveDownloads(0);
    setElapsedSec(0);
    startedAtRef.current = Date.now();
    setNodes(INITIAL_NODES.map((n) => ({ ...n, status: "idle" as NodeStatus })));
    setLogs([]);
    setActiveNode(null);
    setHealingNode(null);

    const url = `${BACKEND}/api/scrape/${jobId}/events`;
    const es = new EventSource(url);

    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        if (data.type === "complete" || data.type === "failed" || data.type === "cancelled") {
          es.close();
          setActiveNode(null);
          setHealingNode(null);
          if (data.type === "complete") {
            setNodes((prev) =>
              prev.map((n) => ({
                ...n,
                status: n.status === "broken" ? "broken" : ("complete" as NodeStatus),
              }))
            );
          }
          if (data.stats) {
            setCacheHits(data.stats.cacheHits ?? 0);
            setLiveDownloads(data.stats.liveDownloads ?? 0);
          }
          return;
        }

        const nodeId = resolveScrapeNodeId(data);
        if (!nodeId) return;

        const log: ScraperLog = {
          id: data.id || `evt-${Date.now()}`,
          ts: data.ts || new Date().toISOString(),
          collector_id: data.brightdata_collector_id || data.collector_id,
          event: data.event,
          facility_name: data.facility_name,
          cpt_code: data.cpt_code,
          cash_price: data.cash_price,
          insurance_rate: data.insurance_rate,
          network: data.network,
          detail: data.detail,
          discovery_source: data.discovery_source,
          cache_hit: data.cache_hit,
          download_source: data.download_source,
        };
        addLog(log);

        if (data.event === "mrf_downloaded") {
          if (data.cache_hit) setCacheHits((c) => c + 1);
          else setLiveDownloads((c) => c + 1);
        }

        switch (data.event) {
          case "collector_started":
          case "page_loaded":
          case "mrf_downloaded":
            setActiveNode(nodeId);
            updateStatus(nodeId, "active");
            break;

          case "extraction_failed":
          case "rate_limited":
            setActiveNode(nodeId);
            updateStatus(nodeId, "broken");
            break;

          case "heal_triggered":
            setHealingNode(nodeId);
            setActiveNode(nodeId);
            updateStatus(nodeId, "healing");
            break;

          case "heal_resumed":
            setHealingNode(null);
            setActiveNode(nodeId);
            updateStatus(nodeId, "active");
            break;

          case "price_extracted":
            updateStatus(nodeId, "complete");
            setHealingNode(null);
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
      } catch {
        /* ignore malformed events */
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      clearInterval(tick);
      es.close();
    };
  }, [jobId, addLog, updateStatus]);

  const isLiveScraping = liveDownloads > 0;
  const isCacheOnly = cacheHits > 0 && liveDownloads === 0 && completedCount > 0;

  return {
    nodes,
    logs,
    activeNode,
    healingNode,
    completedCount,
    totalNodes: HOSPITAL_NODE_COUNT,
    cacheHits,
    liveDownloads,
    elapsedSec,
    isLiveScraping,
    isCacheOnly,
  };
}
