"use client";

import React from "react";
import { motion } from "framer-motion";
import type { PatientProfile } from "@/lib/types";
import { ONBOARDING_STEPS, onboardingProgress } from "@/lib/onboardingProgress";

interface OnboardingProgressProps {
  profile: PatientProfile;
}

export default function OnboardingProgress({ profile }: OnboardingProgressProps) {
  const { filled, total, percent } = onboardingProgress(profile);

  return (
    <div className="w-full max-w-md mx-auto px-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--color-text-tertiary)]">
          Your search profile
        </span>
        <span className="text-[11px] text-[var(--color-text-secondary)]">
          {filled}/{total}
        </span>
      </div>

      <div className="h-1 rounded-full bg-white/5 overflow-hidden mb-3">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, rgba(52,211,153,0.5), rgba(52,211,153,1))",
          }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {ONBOARDING_STEPS.map((step) => {
          const done = step.filled(profile);
          return (
            <span
              key={step.key}
              className={`text-[10px] font-mono uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                done
                  ? "border-[rgba(52,211,153,0.45)] text-[var(--color-accent)] bg-[rgba(52,211,153,0.08)]"
                  : "border-white/10 text-[var(--color-text-tertiary)] bg-white/[0.02]"
              }`}
            >
              {done ? "✓ " : ""}
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
