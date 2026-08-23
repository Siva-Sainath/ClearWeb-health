"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { PatientProfile } from "@/lib/types";
import { isPlaceholderProfileValue } from "@/lib/onboardingProfileGate";
import { ONBOARDING_STEPS } from "@/lib/onboardingProgress";

type FieldKey = "condition" | "insurance" | "city" | "zipCode" | "radiusMi";

/** Cloud anchors — spread around the edges so the centre caption stays clear. */
const FIELD_LAYOUT: Record<FieldKey, { rest: { left?: string; right?: string; top?: string; bottom?: string } }> = {
  condition: { rest: { left: "0%", top: "2%" } },
  insurance: { rest: { right: "0%", top: "4%" } },
  city: { rest: { left: "0%", top: "36%" } },
  zipCode: { rest: { left: "1%", bottom: "10%" } },
  radiusMi: { rest: { right: "1%", bottom: "8%" } },
};

/** Per-cloud float personality */
const FLOAT_STYLE: Record<FieldKey, { duration: number; driftY: number; driftX: number; delay: number }> = {
  condition: { duration: 5.4, driftY: 11, driftX: 7, delay: 0 },
  insurance: { duration: 4.8, driftY: 9, driftX: -6, delay: 0.35 },
  city: { duration: 5.2, driftY: 10, driftX: 6, delay: 0.55 },
  zipCode: { duration: 5.8, driftY: 10, driftX: 5, delay: 0.7 },
  radiusMi: { duration: 4.4, driftY: 8, driftX: -8, delay: 1.05 },
};

const FIELD_META: {
  key: FieldKey;
  label: string;
  value: (p: PatientProfile) => string | null;
  check: (p: PatientProfile) => boolean;
}[] = [
  {
    key: "condition",
    label: "Procedure",
    value: (p) => {
      const v = p.procedure || p.condition;
      if (!v?.trim() || isPlaceholderProfileValue(v)) return null;
      return v;
    },
    check: (p) => {
      const v = p.procedure?.trim() || p.condition?.trim();
      return !!v && !isPlaceholderProfileValue(v);
    },
  },
  {
    key: "insurance",
    label: "Insurance",
    value: (p) => (p.insurance && !isPlaceholderProfileValue(p.insurance) ? p.insurance : null),
    check: (p) => !!p.insurance?.trim() && !isPlaceholderProfileValue(p.insurance),
  },
  {
    key: "city",
    label: "City",
    value: (p) => (p.city && !isPlaceholderProfileValue(p.city) ? p.city : null),
    check: (p) => !!p.city?.trim() && !isPlaceholderProfileValue(p.city),
  },
  {
    key: "zipCode",
    label: "ZIP code",
    value: (p) => (p.zipCode && !isPlaceholderProfileValue(p.zipCode) ? p.zipCode : null),
    check: (p) => !!p.zipCode?.trim() && !isPlaceholderProfileValue(p.zipCode),
  },
  {
    key: "radiusMi",
    label: "Radius",
    value: (p) => (p.radiusMi > 0 ? `${p.radiusMi} mi` : null),
    check: (p) => p.radiusMi > 0,
  },
];

function CloudBubble({
  fieldKey,
  label,
  value,
  paused,
  reducedMotion,
}: {
  fieldKey: FieldKey;
  label: string;
  value: string;
  paused: boolean;
  reducedMotion: boolean;
}) {
  const cfg = FLOAT_STYLE[fieldKey];
  const float = !paused && !reducedMotion;

  return (
    <motion.div
      className="relative"
      animate={
        float
          ? {
              y: [0, -cfg.driftY, 0, cfg.driftY * 0.55, 0],
              x: [0, cfg.driftX, 0, -cfg.driftX * 0.65, 0],
            }
          : { y: 0, x: 0 }
      }
      transition={
        float
          ? {
              duration: cfg.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: cfg.delay,
            }
          : { duration: 0.3 }
      }
    >
      {/* no decorative halo — that rendered as extra circles behind the pill */}
      <div className="cloud-bubble relative px-4 py-2.5 sm:px-5 sm:py-3 min-w-[140px]">
        <div className="relative z-[1]">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: "var(--color-accent)",
                boxShadow: "0 0 8px rgba(52,211,153,0.65)",
              }}
            />
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
              {label}
            </p>
          </div>
          <p className="text-sm sm:text-[15px] font-semibold text-[var(--color-text-primary)] leading-snug break-words line-clamp-3">
            {value}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

interface ProfileFieldBubblesProps {
  profile: PatientProfile;
  merge?: boolean;
  onFlyComplete?: () => void;
}

export default function ProfileFieldBubbles({
  profile,
  merge = false,
  onFlyComplete,
}: ProfileFieldBubblesProps) {
  const reducedMotion = useReducedMotion();
  const filled = FIELD_META.filter((f) => f.check(profile));
  const allRequired = filled.length >= FIELD_META.length;
  const [flying, setFlying] = React.useState(false);
  const flyDoneRef = React.useRef(false);
  const shouldFly = merge && allRequired;

  React.useEffect(() => {
    if (!shouldFly) {
      flyDoneRef.current = false;
      const t = setTimeout(() => setFlying(false), 0);
      return () => clearTimeout(t);
    }
    if (flyDoneRef.current || flying) return;

    const t1 = setTimeout(() => setFlying(true), 0);
    const delay = reducedMotion ? 80 : 900;
    const t2 = setTimeout(() => {
      flyDoneRef.current = true;
      setFlying(false);
      onFlyComplete?.();
    }, delay);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shouldFly, flying, reducedMotion, onFlyComplete]);

  const flyToCenter = shouldFly && flying;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-0" aria-hidden="true">
      <AnimatePresence mode="popLayout">
        {filled.map((field, i) => {
          const val = field.value(profile);
          if (!val) return null;
          if (merge && !flying) return null;

          return (
            <motion.div
              key={`${field.key}-${val}`}
              initial={
                reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 0, scale: 0.5, y: 24, filter: "blur(8px)" }
              }
              animate={
                flyToCenter
                  ? {
                      opacity: 0,
                      scale: 0.2,
                      filter: "blur(4px)",
                      left: "50%",
                      top: "38%",
                      right: "auto",
                      bottom: "auto",
                      x: "-50%",
                      y: "-50%",
                    }
                  : {
                      opacity: 1,
                      scale: 1,
                      filter: "blur(0px)",
                      x: 0,
                      y: 0,
                      left: "auto",
                      right: "auto",
                      top: "auto",
                      bottom: "auto",
                      ...FIELD_LAYOUT[field.key].rest,
                    }
              }
              exit={{ opacity: 0, scale: 0.4, filter: "blur(6px)" }}
              transition={
                flyToCenter
                  ? { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }
                  : {
                      type: "spring",
                      stiffness: 340,
                      damping: 26,
                      delay: i * 0.08,
                    }
              }
              className="absolute max-w-[168px] sm:max-w-[184px]"
            >
              <CloudBubble
                fieldKey={field.key}
                label={field.label}
                value={val}
                paused={flyToCenter}
                reducedMotion={reducedMotion}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function isProfileReady(profile: PatientProfile): boolean {
  return ONBOARDING_STEPS.every((s) => s.filled(profile));
}
