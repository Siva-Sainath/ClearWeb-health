"use client";

/**
 * PriceWaterfallChart — Context-aware horizontal bar chart.
 *
 * Reads sort, filter, and spotlight from DashboardContext.
 * Re-sorts/filters smoothly whenever the agent changes them.
 */

import ReactECharts from "echarts-for-react";
import { useDashboard } from "@/context/DashboardContext";
import type { FacilityResult } from "@/lib/types";

interface Props {
  facilities: Record<string, FacilityResult>;
}

export default function PriceWaterfallChart({ facilities }: Props) {
  const { state, filterFacilities, sortFacilities } = useDashboard();

  const visible = filterFacilities(facilities);
  const sorted = sortFacilities(Object.entries(visible) as [string, FacilityResult][]);

  const names = sorted.map(([, f]) =>
    f.hospital_name.length > 22 ? f.hospital_name.slice(0, 22) + "…" : f.hospital_name
  );

  const option = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 800,
    animationDelay: (idx: number) => idx * 70,
    animationEasing: "cubicOut" as const,

    grid: { top: 16, right: 90, bottom: 16, left: 170, containLabel: false },

    xAxis: {
      type: "value" as const,
      axisLine: { lineStyle: { color: "#2A4434" } },
      splitLine: { lineStyle: { color: "#1C2E22", type: "dashed" as const } },
      axisLabel: {
        color: "#4A6458",
        fontFamily: "monospace",
        fontSize: 10,
        formatter: (v: number) => `$${v}`,
      },
    },

    yAxis: {
      type: "category" as const,
      data: names,
      axisLine: { lineStyle: { color: "#2A4434" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#8BABA0",
        fontFamily: "monospace",
        fontSize: 10,
        width: 160,
        overflow: "truncate" as const,
      },
    },

    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      backgroundColor: "rgba(11,21,16,0.96)",
      borderColor: "#2A4434",
      borderWidth: 1,
      textStyle: { color: "#F2F9F5", fontFamily: "monospace", fontSize: 11 },
      formatter: (params: { dataIndex?: number }[]) => {
        const idx = params[0]?.dataIndex;
        if (idx === undefined) return "";
        const [, f] = sorted[idx];
        const savings = f.cash_price - f.insurance_price;
        return `
          <b style="color:#00C896">${f.hospital_name}</b><br/>
          Insurance: <b style="color:#00FFBA">$${f.insurance_price}</b><br/>
          Cash rate: $${f.cash_price}<br/>
          You save: <b style="color:#00C896">$${savings}</b><br/>
          Distance: ${f.distance_mi} mi &nbsp;|&nbsp; Wait: ${f.wait_days}d
        `;
      },
    },

    series: [
      {
        name: "Insurance Price",
        type: "bar" as const,
        data: sorted.map(([id, f]) => {
          const isSpot = state.spotlightId === id;
          const isDim = state.spotlightId !== null && !isSpot;
          return {
            value: f.insurance_price,
            itemStyle: {
              color: isSpot
                ? { type: "linear", x: 0, y: 0, x2: 1, y2: 0,
                    colorStops: [{ offset: 0, color: "#00C896" }, { offset: 1, color: "#00FFBA" }] }
                : isDim
                ? "rgba(42,68,52,0.3)"
                : "rgba(0,200,150,0.4)",
              borderRadius: [0, 4, 4, 0],
              borderColor: isSpot ? "#00FFBA" : "transparent",
              borderWidth: isSpot ? 1 : 0,
              opacity: isDim ? 0.4 : 1,
            },
          };
        }),
        barMaxWidth: 20,
        label: {
          show: true,
          position: "right" as const,
          formatter: (p: { value?: number }) => `$${p.value ?? 0}`,
          color: "#8BABA0",
          fontFamily: "monospace",
          fontSize: 10,
        },
      },
      {
        name: "Cash Premium",
        type: "bar" as const,
        stack: "total",
        data: sorted.map(([id, f]) => ({
          value: f.cash_price - f.insurance_price,
          itemStyle: {
            color: state.spotlightId === id
              ? "rgba(0,200,150,0.12)"
              : "rgba(0,200,150,0.06)",
            borderRadius: [0, 4, 4, 0],
            opacity: (state.spotlightId !== null && state.spotlightId !== id) ? 0.3 : 1,
          },
        })),
        barMaxWidth: 20,
        label: { show: false },
      },
    ],
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-5 mb-3 px-1">
        <div className="flex items-center gap-2 font-mono text-xs text-[#4A6458]">
          <span className="w-10 h-2.5 rounded inline-block" style={{ background: "linear-gradient(90deg,#00C896,#00FFBA)" }} />
          Your cost
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-[#4A6458]">
          <span className="w-10 h-2.5 rounded bg-[#00C896]/8 border border-[#2A4434] inline-block" />
          Cash premium
        </div>
        <div className="ml-auto font-mono text-[10px] text-[#4A6458]">
          sorted by {state.sortMode}
        </div>
      </div>
      <ReactECharts
        key={`${state.sortMode}-${state.filterMode}-${state.spotlightId}`}
        option={option}
        style={{ height: "340px", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
