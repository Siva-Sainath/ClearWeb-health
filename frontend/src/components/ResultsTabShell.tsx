"use client";

import React from "react";
import { MapPin, ScatterChart, BarChart3, GitCompare, MessageSquare } from "lucide-react";
import { useDashboard } from "@/context/DashboardContext";
import type { TabId } from "@/lib/uiActions";
import { tabLabel } from "@/lib/llmExplanation";
import { tokens } from "@/lib/design-tokens";
import type { FacilityResult } from "@/lib/types";
import dynamic from "next/dynamic";

const FacilityMap = dynamic(() => import("./FacilityMap"), { ssr: false });
const PriceBubbleChart = dynamic(() => import("./PriceBubbleChart"), { ssr: false });
const PriceWaterfallChart = dynamic(() => import("./PriceWaterfallChart"), { ssr: false });
const RadarCompareChart = dynamic(() => import("./RadarCompareChart"), { ssr: false });

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "map", label: "Map", icon: <MapPin size={14} /> },
  { id: "scatter", label: "Scatter", icon: <ScatterChart size={14} /> },
  { id: "range", label: "Range", icon: <BarChart3 size={14} /> },
  { id: "compare", label: "Compare", icon: <GitCompare size={14} /> },
  { id: "chat", label: "Chat", icon: <MessageSquare size={14} /> },
];

import type { DrivingRoute } from "@/hooks/useDrivingRoute";

interface ResultsTabShellProps {
  facilities: Record<string, FacilityResult>;
  zipCode: string;
  userCoords?: { lat: number; lng: number } | null;
  activeRoute?: DrivingRoute | null;
  routeTargetId?: string | null;
  onOpenChat?: () => void;
}

export default function ResultsTabShell({
  facilities,
  zipCode,
  userCoords,
  activeRoute,
  routeTargetId,
  onOpenChat,
}: ResultsTabShellProps) {
  const { state, dispatch } = useDashboard();

  const handleTab = (tab: TabId) => {
    dispatch({ type: "tab", payload: tab });
    if (tab === "chat") onOpenChat?.();
  };

  return (
    <section className="space-y-3" aria-label="Results views">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {tabLabel(state.activeTab)}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors min-h-[44px] ${
              state.activeTab === tab.id
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-white/[0.04] text-[var(--color-text-secondary)] border border-white/[0.06] hover:bg-white/[0.06]"
            }`}
            aria-pressed={state.activeTab === tab.id}
          >
            <span style={{ color: state.activeTab === tab.id ? tokens.accent : undefined }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="glass rounded-2xl overflow-hidden min-h-[min(420px,50vh)] w-full">
        {state.activeTab === "map" && (
          <div className="p-3">
            <FacilityMap
              facilities={facilities}
              zipCode={zipCode}
              userLocation={userCoords ?? null}
              activeRoute={activeRoute ?? null}
              routeTargetId={routeTargetId ?? null}
            />
          </div>
        )}
        {state.activeTab === "scatter" && (
          <div className="p-3 h-[320px]">
            <PriceBubbleChart facilities={facilities} />
          </div>
        )}
        {state.activeTab === "range" && (
          <div className="p-3 h-[320px]">
            <PriceWaterfallChart facilities={facilities} />
          </div>
        )}
        {state.activeTab === "compare" && (
          <div className="p-3 h-[320px]">
            <RadarCompareChart facilities={facilities} />
          </div>
        )}
        {state.activeTab === "chat" && (
          <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
            Use the chat section below or the mic to ask {`Aria`} follow-up questions.
          </div>
        )}
      </div>
    </section>
  );
}
