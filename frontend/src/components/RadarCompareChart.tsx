"use client";

/**
 * RadarCompareChart — Context-aware 5-axis radar.
 *
 * Compare pair is driven by [action:compare:nA:nB] from the agent.
 * Falls back to the top two ranked facilities if no compare pair is set.
 */

import ReactECharts from "echarts-for-react";
import { useDashboard } from "@/context/DashboardContext";
import type { FacilityResult } from "@/lib/types";

interface Props {
  facilities: Record<string, FacilityResult>;
}

function norm(value: number, min: number, max: number, invert = false): number {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return Math.round(invert ? 100 - pct : pct);
}

const MAX_PRICE = 900;
const MIN_PRICE = 200;
const MAX_DIST = 25;
const MAX_WAIT = 10;

function toRadar(f: FacilityResult): number[] {
  return [
    norm(f.insurance_price, MIN_PRICE, MAX_PRICE, true),
    norm(f.distance_mi, 0, MAX_DIST, true),
    (f.rating / 5) * 100,
    f.accredited ? 100 : 30,
    norm(f.wait_days, 0, MAX_WAIT, true),
  ];
}

export default function RadarCompareChart({ facilities }: Props) {
  const { state } = useDashboard();

  // Resolve compare pair
  const ids = Object.keys(facilities);
  const idA = state.compareA && facilities[state.compareA] ? state.compareA : ids[0];
  const idB = state.compareB && facilities[state.compareB] ? state.compareB : ids[1];

  const facilityA = facilities[idA];
  const facilityB = facilities[idB];

  if (!facilityA || !facilityB) {
    return (
      <div className="flex items-center justify-center h-40 text-[#4A6458] font-mono text-sm">
        Not enough facilities to compare.
      </div>
    );
  }

  const option = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 900,
    animationEasing: "elasticOut" as const,

    radar: {
      indicator: [
        { name: "Cost Efficiency", max: 100 },
        { name: "Proximity", max: 100 },
        { name: "Rating", max: 100 },
        { name: "Accreditation", max: 100 },
        { name: "Availability", max: 100 },
      ],
      radius: "65%",
      splitNumber: 4,
      axisName: { color: "#8BABA0", fontSize: 11, fontFamily: "monospace" },
      splitLine: { lineStyle: { color: "#1C2E22" } },
      splitArea: { areaStyle: { color: ["rgba(11,21,16,0.4)", "rgba(11,21,16,0.2)"] } },
      axisLine: { lineStyle: { color: "#2A4434" } },
    },

    tooltip: {
      trigger: "item" as const,
      backgroundColor: "rgba(11,21,16,0.96)",
      borderColor: "#2A4434",
      borderWidth: 1,
      textStyle: { color: "#F2F9F5", fontFamily: "monospace", fontSize: 11 },
    },

    legend: {
      bottom: 4,
      textStyle: { color: "#8BABA0", fontFamily: "monospace", fontSize: 10 },
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
    },

    series: [
      {
        type: "radar" as const,
        data: [
          {
            name: facilityA.hospital_name,
            value: toRadar(facilityA),
            areaStyle: { color: "rgba(0,200,150,0.12)" },
            lineStyle: { color: "#00C896", width: 2 },
            itemStyle: { color: "#00C896" },
            symbol: "circle",
            symbolSize: 5,
          },
          {
            name: facilityB.hospital_name,
            value: toRadar(facilityB),
            areaStyle: { color: "rgba(255,186,0,0.1)" },
            lineStyle: { color: "#FFBA00", width: 2 },
            itemStyle: { color: "#FFBA00" },
            symbol: "circle",
            symbolSize: 5,
          },
        ],
      },
    ],
  };

  const scoreA = toRadar(facilityA).reduce((s, v) => s + v, 0);
  const scoreB = toRadar(facilityB).reduce((s, v) => s + v, 0);
  const winnerLabel = scoreA >= scoreB ? "A" : "B";

  return (
    <div className="w-full">
      {/* Header row */}
      <div className="flex gap-8 mb-4 justify-center">
        {[
          { label: "A", facility: facilityA, color: "#00C896" },
          { label: "B", facility: facilityB, color: "#FFBA00" },
        ].map(({ label, facility, color }) => (
          <div key={label} className="text-center">
            <div className="font-mono text-[9px] tracking-widest uppercase mb-0.5" style={{ color }}>
              Option {label} {winnerLabel === label ? "· Recommended" : ""}
            </div>
            <div className="font-semibold text-[#F2F9F5] text-sm truncate max-w-[150px]">
              {facility.hospital_name}
            </div>
            <div className="font-mono text-xs mt-0.5" style={{ color }}>
              ${facility.insurance_price} · {facility.distance_mi} mi · {facility.rating}★
            </div>
          </div>
        ))}
      </div>

      <ReactECharts
        key={`${idA}-${idB}`}
        option={option}
        style={{ height: "300px", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
