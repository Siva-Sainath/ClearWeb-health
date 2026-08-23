"use client";

/**
 * VoiceRing — organic flowing ribbon (reference wave style).
 *
 * Dozens of thin, slightly offset curves form one distorted ring that
 * reacts to live audio. Matches the Moiré ribbon aesthetic from the
 * reference image rather than stacked concentric circles.
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

const LINE_COUNT = 36;
const POINTS = 220;

function palette(state: VoiceState): { stroke: string; glow: string } {
  switch (state) {
    case "listening":
      return { stroke: "rgba(110,231,183,0.55)", glow: "rgba(52,211,153,0.18)" };
    case "speaking":
      return { stroke: "rgba(167,243,208,0.65)", glow: "rgba(110,231,183,0.22)" };
    case "thinking":
    case "transcribing":
      return { stroke: "rgba(125,211,252,0.5)", glow: "rgba(56,189,248,0.15)" };
    case "error":
      return { stroke: "rgba(252,211,77,0.45)", glow: "rgba(251,191,36,0.12)" };
    case "ready":
      return { stroke: "rgba(110,231,183,0.38)", glow: "rgba(52,211,153,0.1)" };
    default:
      return { stroke: "rgba(148,163,184,0.28)", glow: "rgba(148,163,184,0.06)" };
  }
}

function buildPoints(
  cx: number,
  cy: number,
  baseRadius: number,
  lineIndex: number,
  t: number,
  level: number,
  freq: Uint8Array | null
): { x: number; y: number }[] {
  const lineNorm = lineIndex / LINE_COUNT;
  const linePhase = (lineIndex - LINE_COUNT / 2) * 0.045;
  const angleSkew = (lineIndex - LINE_COUNT / 2) * 0.006;
  const radiusSkew = (lineIndex - LINE_COUNT / 2) * 0.004;

  const pts: { x: number; y: number }[] = [];

  for (let i = 0; i < POINTS; i++) {
    const angleNorm = i / POINTS;
    const angle = angleNorm * Math.PI * 2 - Math.PI / 2 + angleSkew;

    let audio = 0;
    if (freq && freq.length > 0) {
      const idx = Math.min(freq.length - 1, Math.floor(angleNorm * freq.length * 0.72));
      audio = freq[idx] / 255;
    }

    const lobe1 = Math.sin(angle * 3 + t * 0.85 + linePhase) * 0.18;
    const lobe2 = Math.sin(angle * 5 - t * 1.25 + lineNorm * Math.PI) * 0.11;
    const lobe3 = Math.sin(angle * 8 + t * 2.0) * 0.055;
    const lobe4 = Math.sin(angle * 13 + t * 0.55 + linePhase * 2) * 0.028;

    const idle = 0.035 + lobe1 + lobe2 + lobe3 + lobe4;
    const active = audio * 0.42 * level;
    const r = baseRadius * (1 + idle + active + radiusSkew);

    pts.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }

  return pts;
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
  const smoothRef = useRef(0.08);

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

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    let start: number | null = null;
    let raf = 0;

    const loop = (now: number) => {
      if (start === null) start = now;
      const t = (now - start) / 1000;

      const raw = audioLevelRef.current;
      const prev = smoothRef.current;
      smoothRef.current =
        raw > prev ? prev + (raw - prev) * 0.4 : prev + (raw - prev) * 0.07;

      const level = Math.max(0.06, smoothRef.current);
      const colors = palette(voiceStateRef.current);
      const cx = size / 2;
      const cy = size / 2;
      const baseRadius = size * 0.31;

      ctx.clearRect(0, 0, size, size);

      ctx.save();
      const halo = ctx.createRadialGradient(cx, cy, baseRadius * 0.55, cx, cy, baseRadius * 1.35);
      halo.addColorStop(0, colors.glow);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      for (let li = 0; li < LINE_COUNT; li++) {
        const pts = buildPoints(cx, cy, baseRadius, li, t, level, freqRef.current);
        const alpha = 0.12 + (li / LINE_COUNT) * 0.38;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 0.65;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i <= POINTS; i++) {
          const p = pts[i % POINTS];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
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
