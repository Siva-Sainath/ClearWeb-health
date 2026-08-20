"use client";

import React from "react";
import { motion } from "framer-motion";
import type { PatientProfile } from "@/lib/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MergedProfileChipProps {
  profile: PatientProfile;
}

export default function MergedProfileChip({ profile }: MergedProfileChipProps) {
  const reducedMotion = useReducedMotion();
  const parts = [
    profile.procedure || profile.condition,
    profile.insurance,
    profile.zipCode,
    `${profile.radiusMi} mi`,
  ].filter(Boolean);

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="glass-bubble rounded-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center gap-2.5 max-w-[min(100%,36rem)] mx-auto"
    >
      <span
        className="w-2 h-2 rounded-full animate-pulse flex-shrink-0 relative z-[1]"
        style={{
          backgroundColor: "var(--color-accent)",
          boxShadow: "0 0 10px rgba(52,211,153,0.7)",
        }}
      />
      <p className="font-mono text-xs sm:text-sm text-[var(--color-text-primary)] text-center leading-snug relative z-[1]">
        {parts.join(" · ")}
      </p>
    </motion.div>
  );
}
