"use client";

import { useCallback, useRef } from "react";
import type { UIAction } from "@/lib/uiActions";
import { prefetchTts, speakTtsQueued, stopTtsPlayback } from "@/lib/ttsSpeak";

export interface PresentationStep {
  tool?: string;
  args?: Record<string, unknown>;
  delayMs?: number;
  caption?: string;
  actions?: UIAction[];
}

interface OrchestrateOptions {
  spokenScript?: string;
  steps?: PresentationStep[];
  fallbackActions?: UIAction[];
  onUiActions?: (actions: UIAction[]) => void;
  onCaptionChange?: (caption: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onStepIndex?: (index: number) => void;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function usePresentationOrchestrator() {
  const abortRef = useRef(false);

  const stop = useCallback(() => {
    abortRef.current = true;
    stopTtsPlayback();
  }, []);

  const play = useCallback(async (opts: OrchestrateOptions) => {
    abortRef.current = false;
    const {
      spokenScript = "",
      steps = [],
      fallbackActions = [],
      onUiActions,
      onCaptionChange,
      onSpeakingChange,
      onStepIndex,
    } = opts;

    if (spokenScript.trim()) {
      prefetchTts(spokenScript);
      onSpeakingChange?.(true);
      onCaptionChange?.(spokenScript);
      stopTtsPlayback();
      void speakTtsQueued(spokenScript);
    }

    if (steps.length) {
      for (let i = 0; i < steps.length; i++) {
        if (abortRef.current) break;
        const step = steps[i];
        const delay = step.delayMs ?? 700 + i * 400;
        if (delay > 0) await sleep(delay);
        if (abortRef.current) break;

        onStepIndex?.(i);
        const actions = step.actions ?? [];
        if (actions.length) onUiActions?.(actions);

        const caption = step.caption?.trim();
        if (caption) {
          prefetchTts(caption);
          onCaptionChange?.(caption);
          await speakTtsQueued(caption);
        }
      }
    } else if (fallbackActions.length) {
      onUiActions?.(fallbackActions);
    }

    onSpeakingChange?.(false);
    onCaptionChange?.("");
  }, []);

  return { play, stop };
}
