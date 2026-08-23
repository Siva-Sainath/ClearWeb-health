"use client";

import { useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { useDashboard } from "@/context/DashboardContext";
import { useScrapeJob } from "@/hooks/useScrapeJob";
import type { UIAction } from "@/lib/uiActions";
import type { JourneyPhase } from "@/lib/types";
import { executeFacilityBook, executeFacilityCall } from "@/lib/facilityContact";

export default function WebcmdPollHandler() {
  const { setJourneyPhase, scrapeStatus, facilities } = useAppContext();
  const { startScrape } = useScrapeJob();
  const { applyActions, dispatch } = useDashboard();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/webcmd-action");
        if (!res.ok) return;
        const data = await res.json();
        const actions = (data.actions ?? []) as UIAction[];
        if (!actions.length) return;

        const dashActions: UIAction[] = [];
        for (const a of actions) {
          if (a.type === "navigate_phase") {
            const phase = a.payload as JourneyPhase;
            if (phase === "scraping" && scrapeStatus !== "running") {
              void startScrape();
            } else {
              setJourneyPhase(phase);
            }
          } else if (a.type === "navigate_url") {
            window.open(a.payload, "_blank", "noopener,noreferrer");
          } else if (a.type === "navigate_scroll") {
            document.getElementById(`facility-${a.payload}`)?.scrollIntoView({ behavior: "smooth" });
          } else if (a.type === "navigate_panel") {
            document.getElementById(`panel-${a.payload}`)?.scrollIntoView({ behavior: "smooth" });
          } else if (a.type === "call") {
            const f = facilities[a.payload];
            if (f) executeFacilityCall(f);
          } else if (a.type === "book") {
            const f = facilities[a.payload];
            if (f) executeFacilityBook(f);
          } else if (a.type === "route") {
            dispatch({ type: "spotlight", payload: a.payload });
            dispatch({ type: "tab", payload: "map" });
            dispatch({ type: "layout", payload: "mapRoute" });
            document.getElementById(`facility-${a.payload}`)?.scrollIntoView({ behavior: "smooth" });
          } else {
            dashActions.push(a);
          }
        }
        if (dashActions.length) applyActions(dashActions);
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [applyActions, dispatch, setJourneyPhase, startScrape, scrapeStatus, facilities]);

  return null;
}
