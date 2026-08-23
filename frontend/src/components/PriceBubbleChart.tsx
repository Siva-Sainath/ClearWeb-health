"use client";

/**
 * PriceBubbleChart — Context-aware scatter plot.
 *
 * Reads spotlight, filter, and sort from DashboardContext.
 * When a facility is spotlighted, all others dim to 20% opacity.
 * Animated transitions driven by ECharts native animation.
 */

import ReactECharts from "echarts-for-react";
import { useDashboard } from "@/context/DashboardContext";
import type { FacilityResult } from "@/lib/types";
import { chartTheme } from "@/lib/design-tokens";

interface Props {
  facilities: Record<string, FacilityResult>;
}

export default function PriceBubbleChart({ facilities }: Props) {
  const { state, filterFacilities } = useDashboard();
  const visible = filterFacilities(facilities);
  const entries = Object.entries(visible);

  const series = entries.map(([id, f]) => {
    const isSpotlighted = state.spotlightId === id;
    const isDimmed = state.spotlightId !== null && !isSpotlighted;
    const color = f.accredited ? chartTheme.accent : chartTheme.warn;

    return {
      name: f.hospital_name,
      type: "scatter" as const,
      data: [[f.distance_mi, f.insurance_price, f.rating * 8, id]],
      symbolSize: (val: number[]) => {
        const base = Math.max(val[2] * 4, 18);
        return isSpotlighted ? base * 1.4 : base;
      },
      itemStyle: {
        color: isDimmed ? "rgba(42,68,52,0.3)" : color,
        borderColor: isSpotlighted ? "#FFFFFF" : f.accredited ? `${color}66` : "transparent",
        borderWidth: isSpotlighted ? 3 : 1,
        shadowBlur: isSpotlighted ? 40 : isDimmed ? 0 : 10,
        shadowColor: isSpotlighted ? "rgba(255,255,255,0.6)" : `${color}44`,
        opacity: isDimmed ? 0.25 : 1,
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 35,
          shadowColor: `${color}99`,
          borderColor: "#FFFFFF",
          borderWidth: 2,
          opacity: 1,
        },
      },
      label: {
        show: isSpotlighted,
        formatter: f.hospital_name.split(" ").slice(0, 2).join(" "),
        position: "top" as const,
        color: "#F2F9F5",
        fontSize: 11,
        fontFamily: "monospace",
        backgroundColor: "rgba(11,21,16,0.8)",
        padding: [3, 6],
        borderRadius: 4,
      },
    };
  });

  const option = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 600,
    animationEasing: "cubicOut" as const,
    animationUpdate: 400,

    grid: { top: 36, right: 40, bottom: 56, left: 70 },

    xAxis: {
      name: "Distance (mi)",
      nameLocation: "middle" as const,
      nameGap: 38,
      nameTextStyle: { color: chartTheme.text, fontSize: 11 },
      axisLine: { lineStyle: { color: chartTheme.grid } },
      axisTick: { lineStyle: { color: chartTheme.grid } },
      splitLine: { lineStyle: { color: chartTheme.grid, type: "dashed" as const } },
      axisLabel: { color: chartTheme.text, fontSize: 10 },
      min: 0,
    },

    yAxis: {
      name: "Your Cost ($)",
      nameLocation: "middle" as const,
      nameGap: 52,
      nameTextStyle: { color: "#4A6458", fontSize: 11, fontFamily: "monospace" },
      axisLine: { lineStyle: { color: "#2A4434" } },
      axisTick: { lineStyle: { color: "#1C2E22" } },
      splitLine: { lineStyle: { color: "#1C2E22", type: "dashed" as const } },
      axisLabel: {
        color: chartTheme.text,
        fontSize: 10,
        formatter: (v: number) => `$${v}`,
      },
    },

    tooltip: {
      trigger: "item" as const,
      backgroundColor: "rgba(11,21,16,0.96)",
      borderColor: "#2A4434",
      borderWidth: 1,
      textStyle: { color: "#F2F9F5", fontFamily: "monospace", fontSize: 11 },
      formatter: (params: { data: (string | number)[] }) => {
        const id = params.data[3] as string;
        const f = visible[id];
        if (!f) return "";
        return `
          <div style="line-height:1.9">
            <b style="color:#00C896">${f.hospital_name}</b><br/>
            Distance: ${f.distance_mi} mi &nbsp;|&nbsp; Rating: ${f.rating}★<br/>
            Insurance: <b style="color:#00FFBA">$${f.insurance_price}</b><br/>
            Cash: $${f.cash_price} &nbsp;|&nbsp; Wait: ${f.wait_days}d<br/>
            ${f.accredited ? '<span style="color:#00C896">✓ Accredited</span>' : '<span style="color:#FFBA00">⚠ Pending accreditation</span>'}
          </div>
        `;
      },
    },

    legend: { show: false },
    series,
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-5 mb-3 px-1">
        <div className="flex items-center gap-2 font-mono text-xs text-[#4A6458]">
          <span className="w-3 h-3 rounded-full inline-block bg-emerald-400" />
          Accredited
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
          Pending
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          Bubble size = rating
        </div>
        {state.filterMode !== "none" && (
          <div className="ml-auto badge badge-accent text-[10px]">
            {entries.length} of {Object.keys(facilities).length} shown
          </div>
        )}
      </div>
      <ReactECharts
        key={`${state.filterMode}-${state.spotlightId}`}
        option={option}
        style={{ height: "340px", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
