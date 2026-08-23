"use client";

/**
 * useWebSpeechRecognition — continuous, hands-free voice input using the
 * browser's native SpeechRecognition API (Chrome/Edge/Safari).
 *
 * When active, the mic is always hot and the user's words stream into
 * the `onTranscript` callback. A pause in speech finalises the transcript
 * and fires `onFinal` so the caller can submit it. This removes the
 * push-to-talk friction from the onboarding flow.
 */

import { useRef, useCallback, useState, useEffect, useMemo } from "react";

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseWebSpeechRecognitionOptions {
  enabled?: boolean;
  lang?: string;
  onTranscript?: (text: string, hasFinalized: boolean) => void;
  onFinal?: (text: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: string) => void;
}

export interface UseWebSpeechRecognitionReturn {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function useWebSpeechRecognition(options: UseWebSpeechRecognitionOptions): UseWebSpeechRecognitionReturn {
  const { enabled = true, lang = "en-US", onTranscript, onFinal, onStart, onEnd, onSpeechStart, onSpeechEnd, onError } = options;

  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalRef = useRef("");
  const restartPendingRef = useRef(false);
  const startRef = useRef<(() => void) | undefined>(undefined);

  const stop = useCallback(() => {
    restartPendingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  const start = useCallback(() => {
    if (!supported || !enabled) return;

    // Already hot — idempotent start (prevents accidental toggle-off).
    if (listening && recognitionRef.current) return;

    finalRef.current = "";
    restartPendingRef.current = false;

    try {
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) return;

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setListening(true);
        onStart?.();
      };

      recognition.onresult = (event) => {
        let interim = "";
        let freshFinal = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) {
            freshFinal += transcript;
          } else {
            interim += transcript;
          }
        }
        if (freshFinal) {
          finalRef.current += freshFinal;
          onFinal?.(finalRef.current.trim());
        }
        onTranscript?.((finalRef.current + interim).trim(), finalRef.current.length > 0 || freshFinal.length > 0);
      };

      recognition.onspeechstart = () => onSpeechStart?.();
      recognition.onspeechend = () => onSpeechEnd?.();

      recognition.onerror = (event) => {
        if (event.error === "aborted" || event.error === "no-speech") return;
        onError?.(event.error);
      };

      recognition.onend = () => {
        setListening(false);
        onEnd?.();
        if (restartPendingRef.current) {
          restartPendingRef.current = false;
          setTimeout(() => startRef.current?.(), 120);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Speech recognition failed");
      setListening(false);
    }
  }, [supported, enabled, lang, listening, onTranscript, onFinal, onStart, onEnd, onSpeechStart, onSpeechEnd, onError]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const abort = useCallback(() => {
    restartPendingRef.current = false;
    finalRef.current = "";
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      abort();
    };
  }, [abort]);

  return useMemo(
    () => ({ supported, listening, start, stop, abort }),
    [supported, listening, start, stop, abort]
  );
}

export default useWebSpeechRecognition;
