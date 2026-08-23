"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useAppContext } from "@/context/AppContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { WEB_SPOKES, WEB_RING_RADII, WEB_PARALLAX_RANGE } from "@/lib/constants";
import { tokens } from "@/lib/design-tokens";

const CENTER_X = 600;
const CENTER_Y = 450;

function buildPolygon(r: number): string {
  return (
    Array.from({ length: WEB_SPOKES }, (_, i) => {
      const a = (i / WEB_SPOKES) * 2 * Math.PI - Math.PI / 2;
      return `${i === 0 ? "M" : "L"} ${(CENTER_X + r * Math.cos(a)).toFixed(1)} ${(CENTER_Y + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ") + " Z"
  );
}

export default function WebBackground() {
  const { journeyPhase } = useAppContext();
  const reducedMotion = useReducedMotion();
  const pauseParallax = journeyPhase === "scraping" || reducedMotion;

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 40, damping: 25 });
  const y = useSpring(rawY, { stiffness: 40, damping: 25 });

  useEffect(() => {
    if (pauseParallax) {
      rawX.set(0);
      rawY.set(0);
      return;
    }
    const onMove = (e: MouseEvent) => {
      rawX.set((e.clientX / window.innerWidth - 0.5) * WEB_PARALLAX_RANGE);
      rawY.set((e.clientY / window.innerHeight - 0.5) * WEB_PARALLAX_RANGE);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [rawX, rawY, pauseParallax]);

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
      <motion.div
        style={{ x: pauseParallax ? 0 : x, y: pauseParallax ? 0 : y }}
        className="absolute inset-0 w-full h-full"
      >
        <svg viewBox="0 0 1200 900" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="webGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.10" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx={CENTER_X} cy={CENTER_Y} r={520} fill="url(#webGlow)" />

          {Array.from({ length: WEB_SPOKES }, (_, i) => {
            const a = (i / WEB_SPOKES) * 2 * Math.PI - Math.PI / 2;
            return (
              <line
                key={i}
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={(CENTER_X + 560 * Math.cos(a)).toFixed(1)}
                y2={(CENTER_Y + 480 * Math.sin(a)).toFixed(1)}
                stroke="#6ee7b7"
                strokeWidth={i % 3 === 0 ? 0.8 : 0.4}
                opacity={i % 3 === 0 ? 0.12 : 0.06}
              />
            );
          })}

          {WEB_RING_RADII.map((r, i) => (
            <path
              key={r}
              d={buildPolygon(r)}
              fill="none"
              stroke="#ffffff"
              strokeWidth={0.6}
              opacity={0.025 - i * 0.002}
            />
          ))}
        </svg>
      </motion.div>

      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 20%, ${tokens.void} 78%)`,
          opacity: 0.85,
        }}
      />
    </div>
  );
}
