"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { tokens } from "@/lib/design-tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { PatientProfile } from "@/lib/types";

const CHECKLIST: {
  num: string;
  key: keyof PatientProfile | "priority";
  label: string;
  check: (p: PatientProfile) => boolean;
  value: (p: PatientProfile) => string | null;
}[] = [
  {
    num: "01",
    key: "condition",
    label: "Condition or procedure",
    check: (p) => !!(p.condition.trim() || p.procedure?.trim()),
    value: (p) => p.procedure || p.condition || null,
  },
  {
    num: "02",
    key: "insurance",
    label: "Insurance plan",
    check: (p) => !!p.insurance.trim(),
    value: (p) => p.insurance || null,
  },
  {
    num: "03",
    key: "zipCode",
    label: "Zip code",
    check: (p) => !!p.zipCode.trim(),
    value: (p) => p.zipCode || null,
  },
  {
    num: "04",
    key: "radiusMi",
    label: "Search radius",
    check: (p) => p.radiusMi > 0,
    value: (p) => (p.radiusMi > 0 ? `${p.radiusMi} mi` : null),
  },
  {
    num: "05",
    key: "priority",
    label: "Priority (optional)",
    check: (p) => !!(p.priorities?.length),
    value: (p) => p.priorities?.join(", ") || null,
  },
];

function buildSummaryStrip(profile: PatientProfile): string | null {
  const parts: string[] = [];
  const proc = profile.procedure || profile.condition;
  if (proc) parts.push(proc);
  if (profile.insurance) parts.push(profile.insurance);
  if (profile.zipCode) parts.push(profile.zipCode);
  if (profile.radiusMi > 0) parts.push(`${profile.radiusMi} mi`);
  return parts.length >= 2 ? parts.join(" · ") : null;
}

export default function LiveProfilePanel({ profile }: { profile: PatientProfile }) {
  const reducedMotion = useReducedMotion();
  const required = CHECKLIST.filter((c) => c.key !== "priority");
  const requiredDone = required.filter((c) => c.check(profile)).length;
  const done = CHECKLIST.filter((c) => c.check(profile)).length;
  const summary = buildSummaryStrip(profile);

  return (
    <div
      id="panel-profile"
      className="rounded-2xl p-5 space-y-4 sticky top-24"
      style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}
    >
      <div>
        <p className="font-mono text-[11px] text-[var(--color-text-tertiary)] tracking-wide mb-1">
          FIG.1 · Search profile
        </p>
        <p className="text-sm font-light text-[var(--color-text-secondary)]">
          {requiredDone >= required.length
            ? "Ready to crawl — confirm with Aria when you're set."
            : `${requiredDone} of ${required.length} required fields`}
        </p>
      </div>

      {summary && (
        <motion.p
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="font-mono text-xs text-[var(--color-text-secondary)] leading-relaxed"
        >
          {summary}
        </motion.p>
      )}

      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: tokens.accentMuted }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: tokens.accent }}
          initial={false}
          animate={{ width: `${(done / CHECKLIST.length) * 100}%` }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
        />
      </div>

      <ul className="space-y-2">
        {CHECKLIST.map(({ num, key, label, check, value }) => {
          const ok = check(profile);
          const filled = value(profile);
          return (
            <li key={key} className="flex items-start gap-2.5 text-sm">
              <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] pt-0.5 w-5 shrink-0">
                {num}
              </span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border shrink-0 mt-0.5 ${
                  ok ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
                }`}
                style={{
                  borderColor: ok ? tokens.accentBorder : tokens.borderBright,
                  backgroundColor: ok ? tokens.accentMuted : "transparent",
                }}
              >
                {ok && <Check size={12} />}
              </span>
              <div className="flex-1 min-w-0">
                <span className={ok ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}>
                  {label}
                </span>
                {ok && filled && (
                  <motion.p
                    initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="font-mono text-xs text-[var(--color-text-secondary)] mt-0.5 truncate"
                  >
                    {filled}
                  </motion.p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
