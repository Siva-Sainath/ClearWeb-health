"use client";

/**
 * VoiceRing — soft ribbon around Aria.
 * Amplitude is clamped inside the canvas; radii are temporally smoothed
 * so speech and listening swell instead of snapping.
 */

import { useEffect, useRef } from "react";
import type { VoiceState } from "@/lib/voiceState";

interface VoiceRingProps {
  voiceState: VoiceState;
  audioLevel: number;
  freqData?: Uint8Array | null;
  size?: number;
  className?: string;
}

const LINE_COUNT = 6;
const POINT_COUNT = 48;
/** Keep peaks inside the square with a few px of padding. */
const EDGE_PAD = 14;

function palette(state: VoiceState): { stroke: string; glow: string } {
  switch (state) {
    case "listening":
      return { stroke: "rgba(110,231,183,0.55)", glow: "rgba(52,211,153,0.16)" };
    case "speaking":
      return { stroke: "rgba(167,243,208,0.62)", glow: "rgba(110,231,183,0.2)" };
    case "thinking":
    case "transcribing":
      return { stroke: "rgba(125,211,252,0.48)", glow: "rgba(56,189,248,0.14)" };
    case "error":
      return { stroke: "rgba(252,211,77,0.42)", glow: "rgba(251,191,36,0.1)" };
    case "ready":
      return { stroke: "rgba(110,231,183,0.36)", glow: "rgba(52,211,153,0.1)" };
    default:
      return { stroke: "rgba(148,163,184,0.26)", glow: "rgba(148,163,184,0.05)" };
  }
}

function sampleFreq(freq: Uint8Array | null, angleNorm: number, t: number): number {
  if (freq && freq.length > 2) {
    const idx = Math.min(freq.length - 2, Math.floor(angleNorm * freq.length * 0.55));
    const a = freq[idx] / 255;
    const b = freq[idx + 1] / 255;
    return a * 0.65 + b * 0.35;
  }
  return 0.35 + 0.25 * Math.abs(Math.sin(angleNorm * Math.PI * 4 + t * 1.4));
}

function targetRadius(
  baseRadius: number,
  maxRadius: number,
  lineIndex: number,
  angleNorm: number,
  t: number,
  level: number,
  freq: Uint8Array | null
): number {
  const angle = angleNorm * Math.PI * 2 - Math.PI / 2;
  const linePhase = (lineIndex - LINE_COUNT / 2) * 0.22;
  const audio = sampleFreq(freq, angleNorm, t);

  const breathe = Math.sin(t * 0.7 + linePhase) * 0.018;
  const lobeA = Math.sin(angle * 2 + t * 0.55 + linePhase) * 0.045;
  const lobeB = Math.sin(angle * 3 - t * 0.4) * 0.028;
  const voice = audio * Math.min(0.2, level * 0.11);

  const r = baseRadius * (1 + breathe + lobeA + lobeB + voice);
  return Math.min(maxRadius, Math.max(baseRadius * 0.92, r));
}

function strokeClosedCurve(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[]
) {
  const n = pts.length;
  if (n < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y
    );
  }
  ctx.closePath();
}

export default function VoiceRing({
  voiceState,
  audioLevel,
  freqData,
  size = 280,
  className = "",
}: VoiceRingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceStateRef = useRef(voiceState);
  const audioLevelRef = useRef(audioLevel);
  const freqRef = useRef<Uint8Array | null>(freqData ?? null);
  const smoothLevelRef = useRef(0.08);
  const radiiRef = useRef<number[][]>(
    Array.from({ length: LINE_COUNT }, () => new Array(POINT_COUNT).fill(0))
  );

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);
  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);
  useEffect(() => {
    freqRef.current = freqData ?? null;
  }, [freqData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const maxRadius = size / 2 - EDGE_PAD;
    const baseRadius = maxRadius * 0.72;
    for (let li = 0; li < LINE_COUNT; li++) {
      radiiRef.current[li] = new Array(POINT_COUNT).fill(baseRadius);
    }

    let start: number | null = null;
    let raf = 0;

    const loop = (now: number) => {
      if (start === null) start = now;
      const t = (now - start) / 1000;
      const state = voiceStateRef.current;
      const live = state === "listening" || state === "speaking";

      const raw = audioLevelRef.current;
      const prev = smoothLevelRef.current;
      const rise = live ? 0.18 : 0.1;
      const fall = 0.06;
      smoothLevelRef.current =
        raw > prev ? prev + (raw - prev) * rise : prev + (raw - prev) * fall;

      const boost = state === "listening" ? 1.35 : state === "speaking" ? 1.2 : 0.55;
      const level = Math.max(0.06, smoothLevelRef.current) * boost;
      const colors = palette(state);

      ctx.clearRect(0, 0, size, size);

      ctx.save();
      const halo = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, maxRadius);
      halo.addColorStop(0, colors.glow);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const follow = live ? 0.14 : 0.07;

      for (let li = 0; li < LINE_COUNT; li++) {
        const radii = radiiRef.current[li];
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < POINT_COUNT; i++) {
          const angleNorm = i / POINT_COUNT;
          const target = targetRadius(
            baseRadius,
            maxRadius,
            li,
            angleNorm,
            t,
            level,
            freqRef.current
          );
          radii[i] += (target - radii[i]) * follow;
          const angle = angleNorm * Math.PI * 2 - Math.PI / 2;
          pts.push({
            x: cx + Math.cos(angle) * radii[i],
            y: cy + Math.sin(angle) * radii[i],
          });
        }

        ctx.save();
        ctx.globalAlpha = 0.16 + (li / LINE_COUNT) * 0.42;
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 0.9;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        strokeClosedCurve(ctx, pts);
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, overflow: "visible" }}
    />
  );
}
