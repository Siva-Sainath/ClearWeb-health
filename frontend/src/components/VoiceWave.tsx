"use client";

/**
 * VoiceWave — clean audio-reactive sound bars.
 *
 * Displays a row of vertical bars that respond to the live frequency
 * spectrum. When no frequency data is available, it falls back to a
 * gentle simulated wave based on the smoothed audio level. This makes
 * it easy to read and visually pleasing both while listening and speaking.
 */

import { useEffect, useRef } from "react";
import type { VoiceState } from "@/lib/voiceState";

interface VoiceWaveProps {
  voiceState: VoiceState;
  audioLevel: number;
  freqData?: Uint8Array | null;
  width?: number;
  height?: number;
  className?: string;
}

const BAR_COUNT = 40;

function getColor(state: VoiceState): string {
  switch (state) {
    case "listening":
      return "#34d399"; // emerald-400
    case "speaking":
      return "#6ee7b7"; // emerald-300
    case "thinking":
    case "transcribing":
      return "#38bdf8"; // sky-400
    case "error":
      return "#fbbf24"; // amber-400
    case "ready":
      return "#34d399";
    default:
      return "#94a3b8"; // slate-400
  }
}

export default function VoiceWave({
  voiceState,
  audioLevel,
  freqData,
  width = 240,
  height = 44,
  className = "",
}: VoiceWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceStateRef = useRef(voiceState);
  const audioLevelRef = useRef(audioLevel);
  const freqRef = useRef<Uint8Array | null>(freqData ?? null);
  const smoothRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const tRef = useRef(0);

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
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const gap = 2;
    const barW = Math.max(1, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT);
    const radius = Math.min(barW / 2, 3);

    const loop = () => {
      tRef.current += 0.05;
      const state = voiceStateRef.current;
      const rawLevel = audioLevelRef.current;
      const freq = freqRef.current;
      const color = getColor(state);
      const active = state === "listening" || state === "speaking";

      const baseTarget = active ? rawLevel * height * 0.85 : 0;

      const targets: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let target = 0;
        if (freq && freq.length > 0) {
          // Map evenly across the lower-mid frequency bins for better voice range.
          const freqIndex = Math.floor((i / BAR_COUNT) * freq.length * 0.75);
          target = (freq[freqIndex] / 255) * height * 0.92;
        } else {
          // Simulated organic wave when no frequency data is available.
          const wave =
            Math.sin(i * 0.4 + tRef.current * 0.8) * 0.5 +
            Math.sin(i * 0.9 - tRef.current * 1.2) * 0.3 +
            Math.sin(i * 1.4 + tRef.current * 0.4) * 0.2;
          target = (Math.max(0, wave) + 0.2) * baseTarget;
        }

        // Silence dampens all bars.
        if (!active && rawLevel < 0.05) {
          target = Math.min(2, target);
        }
        targets.push(target);
      }

      // Smooth transitions per bar.
      const smooth = smoothRef.current;
      for (let i = 0; i < BAR_COUNT; i++) {
        const speed = targets[i] > smooth[i] ? 0.45 : 0.12;
        smooth[i] += (targets[i] - smooth[i]) * speed;
      }

      ctx.clearRect(0, 0, width, height);

      // Glow under bars.
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 + rawLevel * 18;

      for (let i = 0; i < BAR_COUNT; i++) {
        const h = Math.max(0, smooth[i]);
        if (h < 0.5) continue;
        const x = i * (barW + gap);
        const y = (height - h) / 2;

        const grad = ctx.createLinearGradient(0, y + h, 0, y);
        grad.addColorStop(0, `${color}20`);
        grad.addColorStop(1, color);

        ctx.fillStyle = grad;
        ctx.beginPath();
        if (typeof (ctx as { roundRect?: unknown }).roundRect === "function") {
          ctx.roundRect(x, y, barW, h, radius);
        } else {
          // Fallback for older browsers: simple rounded bar via arcs.
          const r = Math.min(radius, barW / 2, h / 2);
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + barW - r, y);
          ctx.arc(x + barW - r, y + r, r, -Math.PI / 2, 0);
          ctx.lineTo(x + barW, y + h - r);
          ctx.arc(x + barW - r, y + h - r, r, 0, Math.PI / 2);
          ctx.lineTo(x + r, y + h);
          ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
          ctx.lineTo(x, y + r);
          ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width, height }}
    />
  );
}
