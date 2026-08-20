"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { RankedOption } from "@/lib/scrapeExecutiveSummary";
import ConsumerOptionCard from "./ConsumerOptionCard";
import { tokens } from "@/lib/design-tokens";

const RadarCompareChart = dynamic(() => import("./RadarCompareChart"), { ssr: false });

interface CompareSplitViewProps {
  optionA: RankedOption;
  optionB: RankedOption;
  facilities: Record<string, import("@/lib/types").FacilityResult>;
}

export default function CompareSplitView({ optionA, optionB, facilities }: CompareSplitViewProps) {
  const delta = optionB.facility.insurance_price - optionA.facility.insurance_price;
  const cheaper = delta >= 0 ? optionA : optionB;
  const diff = Math.abs(delta);

  return (
    <motion.section
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
      aria-label="Compare split view"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <ConsumerOptionCard option={optionA} spotlight />
        <ConsumerOptionCard option={optionB} spotlight />
      </div>

      <div
        className="glass rounded-2xl p-4 text-center border border-white/[0.06]"
        style={{ borderColor: tokens.accentBorder }}
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          <strong style={{ color: tokens.accent }}>{cheaper.facility.hospital_name}</strong> is $
          {diff} {delta >= 0 ? "less" : "more"} than the other option
        </p>
      </div>

      <div className="glass rounded-2xl p-3 min-h-[240px]">
        <RadarCompareChart facilities={facilities} />
      </div>
    </motion.section>
  );
}
