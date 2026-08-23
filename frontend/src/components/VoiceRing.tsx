"use client";

/**
 * VoiceRing — flowing ribbon around Aria.
 * Strong organic lobes, smoothed curves, peaks clamped inside the canvas.
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

const LINE_COUNT = 11;
const POINT_COUNT = 72;
const EDGE_PAD = 10;

function palette(state: VoiceState): { stroke: string; glow: string } {
  switch (state) {
    case "listening":
      return { stroke: "rgba(110,231,183,0.7)", glow: "rgba(52,211,153,0.22)" };
    case "speaking":
      return { stroke: "rgba(167,243,208,0.78)", glow: "rgba(110,231,183,0.28)" };
    case "thinking":
    case "transcribing":
      return { stroke: "rgba(125,211,252,0.62)", glow: "rgba(56,189,248,0.18)" };
    case "error":
      return { stroke: "rgba(252,211,77,0.5)", glow: "rgba(251,191,36,0.12)" };
    case "ready":
      return { stroke: "rgba(110,231,183,0.48)", glow: "rgba(52,211,153,0.14)" };
    default:
      return { stroke: "rgba(148,163,184,0.32)", glow: "rgba(148,163,184,0.08)" };
  }
}

function sampleFreq(freq: Uint8Array | null, angleNorm: number, t: number): number {
  if (freq && freq.length > 3) {
    const idx = Math.min(freq.length - 2, Math.floor(angleNorm * freq.length * 0.62));
    const prev = freq[Math.max(0, idx - 1)] / 255;
    const cur = freq[idx] / 255;
    const next = freq[idx + 1] / 255;
    return prev * 0.2 + cur * 0.6 + next * 0.2;
  }
  return 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(angleNorm * Math.PI * 3 + t * 1.1));
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
  const spin = t * 0.18;
  const angle = angleNorm * Math.PI * 2 - Math.PI / 2 + spin;
  const lineNorm = lineIndex / LINE_COUNT;
  const linePhase = (lineIndex - LINE_COUNT / 2) * 0.07;
  const audio = sampleFreq(freq, (angleNorm + lineNorm * 0.04) % 1, t);

  const breathe = Math.sin(t * 0.55 + linePhase) * 0.04;
  const lobeA = Math.sin(angle * 3 + t * 0.62 + linePhase) * 0.16;
  const lobeB = Math.sin(angle * 5 - t * 0.38 + lineNorm * Math.PI) * 0.09;
  const lobeC = Math.sin(angle * 2 + t * 0.22) * 0.05;
  const voice = audio * Math.min(0.28, 0.08 + level * 0.16);
  const ribbon = (lineIndex - LINE_COUNT / 2) * 0.012;

  const r = baseRadius * (1 + breathe + lobeA + lobeB + lobeC + voice + ribbon);
  return Math.min(maxRadius, Math.max(baseRadius * 0.78, r));
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
  const smoothLevelRef = useRef(0.12);
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
    const baseRadius = maxRadius * 0.58;
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

      const raw = Math.max(audioLevelRef.current, live ? 0.22 : 0.1);
      const prev = smoothLevelRef.current;
      const rise = live ? 0.22 : 0.1;
      const fall = 0.08;
      smoothLevelRef.current =
        raw > prev ? prev + (raw - prev) * rise : prev + (raw - prev) * fall;

      const boost = state === "listening" ? 1.55 : state === "speaking" ? 1.4 : 0.85;
      const level = Math.max(0.12, smoothLevelRef.current) * boost;
      const colors = palette(state);

      ctx.clearRect(0, 0, size, size);

      ctx.save();
      const halo = ctx.createRadialGradient(cx, cy, baseRadius * 0.4, cx, cy, maxRadius);
      halo.addColorStop(0, colors.glow);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const follow = live ? 0.2 : 0.09;

      for (let li = 0; li < LINE_COUNT; li++) {
        const radii = radiiRef.current[li];
        const next = new Array(POINT_COUNT);
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
          next[i] = radii[i] + (target - radii[i]) * follow;
        }
        for (let i = 0; i < POINT_COUNT; i++) {
          const a = next[(i - 1 + POINT_COUNT) % POINT_COUNT];
          const b = next[i];
          const c = next[(i + 1) % POINT_COUNT];
          radii[i] = a * 0.18 + b * 0.64 + c * 0.18;
        }

        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < POINT_COUNT; i++) {
          const angle = (i / POINT_COUNT) * Math.PI * 2 - Math.PI / 2;
          pts.push({
            x: cx + Math.cos(angle) * radii[i],
            y: cy + Math.sin(angle) * radii[i],
          });
        }

        ctx.save();
        ctx.globalAlpha = 0.14 + (li / LINE_COUNT) * 0.5;
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 0.7 + (li / LINE_COUNT) * 0.35;
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
      style={{ width: size, height: size }}
    />
  );
}
