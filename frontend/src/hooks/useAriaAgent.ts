"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  parseAllTags,
  stripTags,
  buildUIStateContext,
  type UIAction,
} from "@/lib/uiActions";
import { matchFollowUpIntent } from "@/lib/followUpIntents";
import type { JourneyPhase, PatientProfile, VapiMessage, FacilityResult, ScrapePresentationMode } from "@/lib/types";
import { VOICE_COPY, getOnboardingWelcomeSpoken, getOnboardingWelcomeCaption, getOnboardingWelcomeMessage, getOnboardingWelcomeChunks } from "@/lib/voiceCopy";
import { deriveVoiceState, resolveActivityLabel } from "@/lib/voiceState";
import type { VoiceState } from "@/lib/voiceState";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import {
  executeFacilityBook,
  executeFacilityCall,
} from "@/lib/facilityContact";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { speakTts, prefetchTts, ensureTtsReady, speakTtsQueued, unlockAudioPlayback, getSharedAudioContext, isTtsPlaying } from "@/lib/ttsSpeak";
import { normalizeProfileUpdates, normalizeUserTranscript } from "@/lib/profileNormalize";
import { gateOnboardingProfileUpdates } from "@/lib/onboardingProfileGate";
import { EMPTY_PROFILE } from "@/lib/types";
import { coverageBlockFromText, coverageBlockFromProfile } from "@/lib/coverageGate";
import { useWebSpeechRecognition } from "@/hooks/useWebSpeechRecognition";

const BACKEND =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"
    : "http://localhost:3001";

const USE_INSTANT_DEMO =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEMO_INSTANT_RESULTS !== "false";

const AGENTIC_RESULTS =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_AGENTIC_RESULTS === "true";

/** Local Whisper via backend — avoids Chrome cloud speech "network" failures. */
const PREFER_LOCAL_STT =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_PREFER_LOCAL_STT !== "false";

/** Prevents duplicate welcome speech when multiple callers race. */
let globalSpeakWelcomeLock: Promise<void> | null = null;

export type AriaPhase = "onboarding" | "scraping" | "results";

export interface UseAriaAgentOptions {
  phase: AriaPhase;
  profile?: PatientProfile;
  facilities?: Record<string, FacilityResult>;
  enabled?: boolean;
  autoStart?: boolean;
  onProfileUpdate?: (partial: Partial<PatientProfile>) => void;
  onPhaseNavigate?: (phase: JourneyPhase) => void;
  onScrapeConfirm?: () => void;
  onUIActions?: (actions: UIAction[]) => void;
  dashState?: Parameters<typeof buildUIStateContext>[0];
  onThinkingChange?: (thinking: boolean) => void;
  executiveSummary?: ScrapeExecutiveSummary | null;
  onRouteFacility?: (facilityId: string) => void;
  resultsSource?: ScrapePresentationMode;
  /** Opens the coverage panel when Aria refuses an out-of-list ask. */
  onCoverageNudge?: () => void;
}

export interface UseAriaAgentReturn {
  messages: VapiMessage[];
  caption: string;
  voiceState: VoiceState;
  activityLabel: string | null;
  isActive: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isProcessing: boolean;
  audioLevel: number;
  /** Raw frequency-domain bytes from AnalyserNode (mic or TTS). Null when inactive. */
  freqData: Uint8Array | null;
  error: string | null;
  startVoiceSession: () => Promise<void>;
  toggleVoiceInput: () => Promise<void>;
  stopVoiceSession: () => void;
  sendTextFallback: (text: string) => Promise<void>;
  clearError: () => void;
}

function pickMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm";
}

export function useAriaAgent(options: UseAriaAgentOptions): UseAriaAgentReturn {
  const {
    phase,
    profile,
    facilities = {},
    enabled = true,
    autoStart = false,
    onProfileUpdate,
    onPhaseNavigate,
    onScrapeConfirm,
    onUIActions,
    dashState,
    onThinkingChange,
    executiveSummary,
    onRouteFacility,
    resultsSource,
    onWelcomeStart,
    onCoverageNudge,
  } = options;

  const [messages, setMessages] = useState<VapiMessage[]>([]);
  const [caption, setCaption] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [freqData, setFreqData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const isActiveRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordMimeRef = useRef("audio/webm");
  const recordLevelRafRef = useRef<number | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const speakLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);
  const spokenWelcomeRef = useRef(false);
  const welcomeInFlightRef = useRef<Promise<void> | null>(null);
  const lastUserMessageRef = useRef("");
  const recordStartRef = useRef(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const speechLevelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webSpeechFinalRef = useRef("");
  const submitPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micRequestedRef = useRef(false);
  const micGrantedRef = useRef(false);
  const conversationModeRef = useRef(false);
  const welcomeStartedRef = useRef(false);
  const welcomeAudioPendingRef = useRef(false);
  const welcomeAudioPlayedRef = useRef(false);
  const profileRef = useRef<PatientProfile>(profile ?? EMPTY_PROFILE);
  const ensureListeningRef = useRef<() => Promise<void>>(async () => {});
  const vadCleanupRef = useRef<(() => void) | null>(null);
  const analyserCleanupRef = useRef<(() => void) | null>(null);
  const listenResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    profileRef.current = profile ?? EMPTY_PROFILE;
  }, [profile]);

  const stopRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  const setProcessing = useCallback(
    (value: boolean) => {
      isProcessingRef.current = value;
      setIsProcessing(value);
      onThinkingChange?.(value);
    },
    [onThinkingChange]
  );

  const sendTextRef = useRef<(text: string) => Promise<void>>(async () => {});
  const startRecordingRef = useRef<() => Promise<void>>(async () => {});

  const voiceState = deriveVoiceState({
    isActive,
    isListening,
    isSpeaking,
    isTranscribing,
    isProcessing,
    error,
  });

  const activityLabel = resolveActivityLabel(voiceState, phase, profile);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const clearError = useCallback(() => setError(null), []);

  const stopRecordLevel = useCallback(() => {
    if (recordLevelRafRef.current) cancelAnimationFrame(recordLevelRafRef.current);
    recordLevelRafRef.current = null;
    analyserCleanupRef.current?.();
    analyserCleanupRef.current = null;
    if (!isSpeakingRef.current) setAudioLevel(0);
  }, []);

  const startRecordLevel = useCallback((stream: MediaStream) => {
    stopRecordLevel();
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyserCleanupRef.current = () => {
        try {
          source.disconnect();
          analyser.disconnect();
        } catch {
          /* ignore */
        }
      };
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setAudioLevel(Math.min(1, Math.max(0.18, avg * 2.6)));
        setFreqData(new Uint8Array(data));
        recordLevelRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setAudioLevel(0.35);
    }
  }, [stopRecordLevel]);

  const setMicEnabled = useCallback((enabled: boolean) => {
    const stream = previewStreamRef.current || mediaStreamRef.current;
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const stopSpeechLevelSim = useCallback(() => {
    if (speechLevelTimerRef.current) {
      clearInterval(speechLevelTimerRef.current);
      speechLevelTimerRef.current = null;
    }
    if (!isRecordingRef.current && !isSpeakingRef.current) setAudioLevel(0);
  }, []);

  const startSpeechLevelSim = useCallback(() => {
    stopSpeechLevelSim();
    speechLevelTimerRef.current = setInterval(() => {
      const t = Date.now() / 1000;
      const level = 0.42 + Math.sin(t * 4.2) * 0.22 + Math.sin(t * 9.1) * 0.14;
      setAudioLevel(Math.max(0.22, Math.min(0.95, level)));
    }, 50);
  }, [stopSpeechLevelSim]);

  const startMicPreview = useCallback(async () => {
    if (previewStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      previewStreamRef.current = stream;
      startRecordLevel(stream);
    } catch {
      startSpeechLevelSim();
    }
  }, [startRecordLevel, startSpeechLevelSim]);

  const stopMicPreview = useCallback(() => {
    stopRecordLevel();
    stopSpeechLevelSim();
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
  }, [stopRecordLevel, stopSpeechLevelSim]);

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      previewStreamRef.current?.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = stream;
      startRecordLevel(stream);
      micGrantedRef.current = true;
      return true;
    } catch {
      previewStreamRef.current?.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
      return false;
    }
  }, [startRecordLevel]);

  const stopSpeakLevelSim = useCallback(() => {
    if (speakLevelTimerRef.current) {
      clearInterval(speakLevelTimerRef.current);
      speakLevelTimerRef.current = null;
    }
    if (!isRecordingRef.current && !speechLevelTimerRef.current) setAudioLevel(0);
  }, []);

  const startSpeakLevelSim = useCallback(() => {
    stopSpeakLevelSim();
    speakLevelTimerRef.current = setInterval(() => {
      // Smoother than pure random — sinusoidal base + small noise
      const t = Date.now() / 1000;
      const level = 0.45 + Math.sin(t * 3.1) * 0.28 + Math.sin(t * 7.3) * 0.14;
      setAudioLevel(Math.max(0.22, Math.min(0.95, level)));
    }, 50); // 20 fps update
  }, [stopSpeakLevelSim]);

  const stopTtsAudio = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.src = "";
      ttsAudioRef.current = null;
    }
    stopSpeakLevelSim();
  }, [stopSpeakLevelSim]);

  const stopRecording = useCallback(() => {
    stopRecordTimer();
    vadCleanupRef.current?.();
    vadCleanupRef.current = null;
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    isRecordingRef.current = false;
    setIsListening(false);
    stopRecordLevel();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }
      recorder.stop();
      return;
    }

    mediaRecorderRef.current = null;
  }, [stopRecordLevel, stopRecordTimer]);

  const transcribeBlob = useCallback(async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append("audio", blob, `recording.${recordMimeRef.current.includes("mp4") ? "mp4" : "webm"}`);
    const res = await fetch(`${BACKEND}/api/stt/transcribe`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Transcription failed");
    return normalizeUserTranscript((data.text as string)?.trim() ?? "");
  }, []);

  const submitWebSpeechTranscript = useCallback(() => {
    if (submitPauseTimerRef.current) {
      clearTimeout(submitPauseTimerRef.current);
      submitPauseTimerRef.current = null;
    }
    const text = webSpeechFinalRef.current.trim();
    webSpeechFinalRef.current = "";
    if (text) {
      void sendTextRef.current(text);
    }
  }, []);

  const webSpeech = useWebSpeechRecognition({
    enabled: enabled && typeof window !== "undefined" && phase !== "scraping",
    onTranscript: (text, hasFinalized) => {
      if (submitPauseTimerRef.current) {
        clearTimeout(submitPauseTimerRef.current);
        submitPauseTimerRef.current = null;
      }
      if (text) {
        setCaption(text);
      }
      if (hasFinalized) {
        // Keep a gentle visual pulse when we have finalized words.
        setAudioLevel((prev) => Math.max(0.2, prev * 0.9));
      }
    },
    onFinal: (finalText) => {
      if (finalText) {
        webSpeechFinalRef.current = finalText;
      }
    },
    onStart: () => {
      setIsListening(true);
      setCaption(VOICE_COPY.listening);
    },
    onEnd: () => {
      setIsListening(false);
      if (submitPauseTimerRef.current || webSpeechFinalRef.current.trim()) return;
      if (
        conversationModeRef.current &&
        micGrantedRef.current &&
        !isSpeakingRef.current &&
        !isProcessingRef.current &&
        !isRecordingRef.current
      ) {
        window.setTimeout(() => {
          if (isSpeakingRef.current || isTtsPlaying() || isProcessingRef.current) return;
          void ensureListeningRef.current();
        }, 300);
      }
    },
    onSpeechStart: () => {
      // Quick level bump so the wave reacts immediately when the user starts talking.
      setAudioLevel((prev) => Math.max(prev, 0.3));
    },
    onSpeechEnd: () => {
      // Submit after a short pause so trailing words are captured.
      if (webSpeechFinalRef.current.trim()) {
        submitPauseTimerRef.current = setTimeout(() => submitWebSpeechTranscript(), 900);
      }
    },
    onError: (err) => {
      if (err === "not-allowed" || err === "service-not-allowed") {
        if (micRequestedRef.current) setError(VOICE_COPY.micDenied);
        return;
      }
      if (err === "network") {
        // Chrome's cloud speech service is unreachable — fall back to local recording.
        webSpeech.stop();
        if (micRequestedRef.current && !isRecordingRef.current && !isSpeakingRef.current) {
          void startRecordingRef.current();
        }
        return;
      }
      if (err !== "no-speech" && err !== "aborted") {
        setError(err);
      }
    },
  });

  const pauseListening = useCallback(() => {
    webSpeech.stop();
    stopRecording();
    setMicEnabled(false);
    webSpeechFinalRef.current = "";
    if (submitPauseTimerRef.current) {
      clearTimeout(submitPauseTimerRef.current);
      submitPauseTimerRef.current = null;
    }
    if (listenResumeTimerRef.current) {
      clearTimeout(listenResumeTimerRef.current);
      listenResumeTimerRef.current = null;
    }
  }, [webSpeech, stopRecording, setMicEnabled]);

  const speakWithEdgeTTS = useCallback(
    async (text: string): Promise<void> => {
      const clean = stripTags(text);
      if (!clean) return;

      pauseListening();

      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setCaption(clean);

      try {
        await speakTtsQueued(clean, {
          audioRef: ttsAudioRef,
          onPlaying: () => {
            startSpeakLevelSim();
          },
        });
      } finally {
        stopSpeakLevelSim();
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (conversationModeRef.current) {
          listenResumeTimerRef.current = setTimeout(() => {
            listenResumeTimerRef.current = null;
            if (!isSpeakingRef.current && !isTtsPlaying()) {
              void ensureListeningRef.current();
            }
          }, 450);
        }
      }
    },
    [pauseListening, startSpeakLevelSim, stopSpeakLevelSim]
  );

  const speakWelcome = useCallback(
    async (greeting: string) => {
      if (globalSpeakWelcomeLock) {
        await globalSpeakWelcomeLock;
        return;
      }

      const run = async () => {
        pauseListening();
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        const greetingText =
          phase === "onboarding" ? getOnboardingWelcomeSpoken() : greeting;
        setCaption(greetingText);

        try {
          if (phase === "onboarding") {
            const chunks = getOnboardingWelcomeChunks();
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              const lookRightCue = i === Math.min(1, chunks.length - 1);
              setCaption(chunk);
              if (lookRightCue) onWelcomeStart?.();
              await speakTts(chunk, {
                audioRef: ttsAudioRef,
                onPlaying: () => startSpeakLevelSim(),
              });
            }
            setCaption(getOnboardingWelcomeCaption());
          } else {
            prefetchTts(greeting);
            await speakTts(greeting, {
              audioRef: ttsAudioRef,
              onPlaying: () => {
                setCaption(greeting);
                startSpeakLevelSim();
              },
            });
          }
        } finally {
          stopSpeakLevelSim();
          isSpeakingRef.current = false;
          setIsSpeaking(false);
        }
      };

      globalSpeakWelcomeLock = run();
      try {
        await globalSpeakWelcomeLock;
      } finally {
        globalSpeakWelcomeLock = null;
      }
    },
    [phase, pauseListening, startSpeakLevelSim, stopSpeakLevelSim, onWelcomeStart]
  );

  // Keep a live mic visualizer running while the Web Speech session is hot.
  useEffect(() => {
    if (!webSpeech.supported || !webSpeech.listening) {
      stopMicPreview();
      return;
    }
    if (!isSpeakingRef.current && !isProcessingRef.current) {
      void startMicPreview();
    }
    return () => {
      stopMicPreview();
    };
  }, [webSpeech.listening, webSpeech.supported, startMicPreview, stopMicPreview]);

  const applyProfileFromAgent = useCallback(
    (raw: Record<string, unknown>, userMessage: string) => {
      const base = profile ?? EMPTY_PROFILE;
      const normalized = normalizeProfileUpdates(raw, base);
      const partial =
        phase === "onboarding"
          ? gateOnboardingProfileUpdates(
              normalized,
              base,
              userMessage,
              historyRef.current
            )
          : normalized;
      if (Object.keys(partial).length) onProfileUpdate?.(partial);
    },
    [phase, profile, onProfileUpdate]
  );

  const applyParsedTags = useCallback(
    (fullText: string, options?: { userMessage?: string; skipProfile?: boolean }) => {
      const parsed = parseAllTags(fullText);

      if (
        !options?.skipProfile &&
        Object.keys(parsed.profileUpdates).length
      ) {
        applyProfileFromAgent(
          parsed.profileUpdates as Record<string, unknown>,
          options?.userMessage ?? lastUserMessageRef.current
        );
      }

      const dashActions = parsed.actions.filter(
        (a) =>
          ![
            "navigate_phase",
            "navigate_url",
            "navigate_scroll",
            "navigate_panel",
            "call",
            "book",
            "route",
          ].includes(a.type)
      );
      if (dashActions.length) onUIActions?.(dashActions);

      for (const action of parsed.actions) {
        if (action.type === "call") {
          const f = facilities[action.payload];
          if (f) executeFacilityCall(f);
        }
        if (action.type === "book") {
          const f = facilities[action.payload];
          if (f) executeFacilityBook(f);
        }
        if (action.type === "route") {
          onRouteFacility?.(action.payload);
        }
        if (action.type === "navigate_phase") {
          if (action.payload === "scraping") {
            const block = coverageBlockFromProfile(profileRef.current || EMPTY_PROFILE);
            if (block) {
              onCoverageNudge?.();
              setCaption(block.speech);
              void speakWithEdgeTTS(block.speech);
              return parsed;
            }
            onScrapeConfirm?.();
            return parsed;
          }
          onPhaseNavigate?.(action.payload as JourneyPhase);
        }
        if (action.type === "navigate_url") {
          window.open(action.payload, "_blank", "noopener,noreferrer");
        }
        if (action.type === "navigate_scroll") {
          document.getElementById(`facility-${action.payload}`)?.scrollIntoView({ behavior: "smooth" });
        }
        if (action.type === "navigate_panel") {
          document.getElementById(`panel-${action.payload}`)?.scrollIntoView({ behavior: "smooth" });
        }
      }

      parsed.actions
        .filter((a) => a.type === "show_card")
        .forEach((a) => {
          if (a.type === "show_card") {
            setMessages((prev) => [
              ...prev,
              { id: `card-${Date.now()}-${a.payload}`, role: "agent", text: "", attachmentId: a.payload },
            ]);
          }
        });

      return parsed;
    },
    [applyProfileFromAgent, onUIActions, onPhaseNavigate, onScrapeConfirm, facilities, onRouteFacility, speakWithEdgeTTS, onCoverageNudge]
  );

  const extractProfileFallback = useCallback(
    async (userMessage: string) => {
      if (phase !== "onboarding") return;
      try {
        const res = await fetch(`${BACKEND}/api/agent/extract-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyRef.current }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: Record<string, unknown> };
        const extracted = data.profile;
        if (!extracted) return;
        const hasValue = Object.entries(extracted).some(([k, v]) => {
          if (k === "radiusMi") return Number(v) > 0;
          if (Array.isArray(v)) return v.length > 0;
          return typeof v === "string" && v.trim().length > 0;
        });
        if (hasValue) applyProfileFromAgent(extracted, userMessage);
      } catch {
        /* non-fatal */
      }
    },
    [phase, applyProfileFromAgent]
  );

  const handleAgentResponse = useCallback(
    async (
      fullText: string,
      agentId?: string,
      extraProfile?: Record<string, unknown>,
      userMessage?: string
    ) => {
      const parsed = parseAllTags(fullText);
      const msg = userMessage ?? lastUserMessageRef.current;
      const hasServerProfile = extraProfile && Object.keys(extraProfile).length > 0;

      if (hasServerProfile) {
        applyProfileFromAgent(extraProfile, msg);
      }

      const parsedForProfile = applyParsedTags(fullText, {
        userMessage: msg,
        skipProfile: hasServerProfile,
      });

      if (
        phase === "onboarding" &&
        !hasServerProfile &&
        !Object.keys(parsedForProfile.profileUpdates).length
      ) {
        await extractProfileFallback(msg);
      }

      historyRef.current.push({ role: "assistant", content: fullText });
      const display = parsed.clean || stripTags(fullText);

      if (agentId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === agentId ? { ...m, text: display } : m))
        );
      }

      prefetchTts(display);
      await Promise.all([
        ensureTtsReady(display),
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
      ]);

      const triggersInstantResults =
        USE_INSTANT_DEMO &&
        parsed.actions.some(
          (a) =>
            a.type === "navigate_phase" &&
            (a.payload === "scraping" || a.payload === "results")
        );

      if (!triggersInstantResults) {
        await speakWithEdgeTTS(display);
      }
    },
    [applyParsedTags, applyProfileFromAgent, extractProfileFallback, phase, speakWithEdgeTTS]
  );

  const handleDeterministicFollowUp = useCallback(
    async (trimmed: string, agentId: string) => {
      if (!executiveSummary) return false;
      const visibleIds = Object.keys(facilities);
      const match = matchFollowUpIntent(trimmed, {
        summary: executiveSummary,
        facilities,
        visibleIds,
      });
      if (!match) return false;

      if (match.actions.length) onUIActions?.(match.actions);
      prefetchTts(match.speech);
      await Promise.all([
        ensureTtsReady(match.speech),
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
      ]);

      historyRef.current.push({ role: "assistant", content: match.speech });
      setMessages((prev) =>
        prev.map((m) => (m.id === agentId ? { ...m, text: match.speech } : m))
      );
      await speakWithEdgeTTS(match.speech);
      return true;
    },
    [executiveSummary, facilities, onUIActions, speakWithEdgeTTS]
  );

  const sendText = useCallback(
    async (userText: string) => {
      const trimmed = normalizeUserTranscript(userText.trim());
      if (!trimmed || phase === "scraping") return;

      if (!isActiveRef.current) {
        setIsActive(true);
        isActiveRef.current = true;
      }

      setProcessing(true);
      pauseListening();

      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);
      historyRef.current.push({ role: "user", content: trimmed });
      lastUserMessageRef.current = trimmed;
      setError(null);

      const coverageHit = coverageBlockFromText(trimmed);
      if (coverageHit && (phase === "onboarding" || phase === "results")) {
        setProcessing(true);
        pauseListening();
        const agentId = `a-cov-${Date.now()}`;
        setMessages((prev) => [...prev, { id: agentId, role: "agent", text: coverageHit.speech }]);
        historyRef.current.push({ role: "assistant", content: coverageHit.speech });
        setCaption(coverageHit.speech);
        onCoverageNudge?.();
        try {
          await speakWithEdgeTTS(coverageHit.speech);
        } finally {
          setProcessing(false);
        }
        return;
      }

      setCaption(VOICE_COPY.thinking);

      const uiContext = dashState ? buildUIStateContext(dashState) : "";
      const agentId = `a-${Date.now()}`;
      setMessages((prev) => [...prev, { id: agentId, role: "agent", text: "" }]);

      try {
        if (phase === "results" && executiveSummary) {
          const handledLocally = await handleDeterministicFollowUp(trimmed, agentId);
          if (handledLocally) return;
        }

        const res = await fetch(`${BACKEND}/api/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase,
            messages: historyRef.current,
            profile: profileRef.current,
            facilities,
            uiContext,
          }),
        });

        if (!res.ok) throw new Error(`Backend ${res.status}`);
        if (!res.body) throw new Error("No stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let handled = false;
        let profileUpdates: Record<string, unknown> = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            const json = JSON.parse(line.slice(6));
            if (json.token) {
              fullText += json.token;
              const partialDisplay = stripTags(fullText).trim();
              if (partialDisplay) {
                setCaption(partialDisplay);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentId ? { ...m, text: partialDisplay } : m
                  )
                );
              }
            }
            if (json.done && !handled) {
              handled = true;
              profileUpdates = json.profileUpdates ?? {};
              await handleAgentResponse(
                json.fullText || fullText,
                agentId,
                profileUpdates,
                trimmed
              );
            }
            if (json.error) throw new Error(json.error);
          }
        }

        if (!handled && fullText) {
          await handleAgentResponse(fullText, agentId, undefined, trimmed);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : VOICE_COPY.connectionError;
        setError(msg);
        setCaption(msg);
      } finally {
        setProcessing(false);
      }
    },
    [phase, facilities, dashState, handleAgentResponse, handleDeterministicFollowUp, executiveSummary, pauseListening, setProcessing, speakWithEdgeTTS, onCoverageNudge]
  );

  useEffect(() => {
    sendTextRef.current = sendText;
  }, [sendText]);

  const startRecording = useCallback(async () => {
    if (isProcessingRef.current || isSpeakingRef.current || isRecordingRef.current) return;

    setError(null);

    try {
      let stream = previewStreamRef.current;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        previewStreamRef.current = stream;
        micGrantedRef.current = true;
      }
      mediaStreamRef.current = stream;
      recordMimeRef.current = pickMimeType();

      const recorder = new MediaRecorder(stream, {
        mimeType: recordMimeRef.current,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stopRecordTimer();
        vadCleanupRef.current?.();
        vadCleanupRef.current = null;
        if (vadIntervalRef.current) {
          clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = null;
        }
        mediaRecorderRef.current = null;
        isRecordingRef.current = false;
        setIsListening(false);
        stopRecordLevel();
        setMicEnabled(false);

        const durationMs = Date.now() - recordStartRef.current;
        const blob = new Blob(recordChunksRef.current, { type: recordMimeRef.current });
        recordChunksRef.current = [];

        if (durationMs < 1200) {
          setCaption(VOICE_COPY.tooShort);
          if (conversationModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
            void ensureListeningRef.current();
          }
          return;
        }

        if (blob.size < 2000) {
          setCaption(VOICE_COPY.noAudio);
          if (conversationModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
            void ensureListeningRef.current();
          }
          return;
        }

        setIsTranscribing(true);
        setCaption(VOICE_COPY.transcribing);
        try {
          const text = await transcribeBlob(blob);
          setIsTranscribing(false);
          if (text) {
            await sendTextRef.current(text);
          } else {
            setCaption(VOICE_COPY.emptyTranscript);
            if (conversationModeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
              void ensureListeningRef.current();
            }
          }
        } catch (err: unknown) {
          setIsTranscribing(false);
          const msg = err instanceof Error ? err.message : VOICE_COPY.connectionError;
          setError(msg);
          setCaption(msg);
        }
      };

      recorder.onerror = () => {
        setError(VOICE_COPY.recordingFailed);
        stopRecording();
      };

      recordStartRef.current = Date.now();
      recorder.start(1000);
      isRecordingRef.current = true;
      setIsListening(true);
      setCaption(VOICE_COPY.listening);
      setMicEnabled(true);
      startRecordLevel(stream);

      if (PREFER_LOCAL_STT) {
        let heardSpeech = false;
        let lastSpeechAt = Date.now();
        try {
          const ctx = getSharedAudioContext();
          if (!ctx) throw new Error("no ctx");
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          vadCleanupRef.current = () => {
            try {
              source.disconnect();
              analyser.disconnect();
            } catch {
              /* ignore */
            }
          };
          vadIntervalRef.current = setInterval(() => {
            if (isSpeakingRef.current || isTtsPlaying()) return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
            if (avg > 0.08) {
              heardSpeech = true;
              lastSpeechAt = Date.now();
            } else if (heardSpeech && Date.now() - lastSpeechAt > 900) {
              if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
              }
            }
          }, 120);
        } catch {
          /* VAD optional */
        }
      }

      stopRecordTimer();
      recordTimerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - recordStartRef.current) / 1000);
        setCaption(VOICE_COPY.listeningSeconds(sec));
      }, 500);
    } catch {
      setError(VOICE_COPY.micDenied);
    }
  }, [stopRecording, stopRecordLevel, startRecordLevel, transcribeBlob, stopRecordTimer, setMicEnabled]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const startListening = useCallback(async (): Promise<boolean> => {
    micRequestedRef.current = true;
    setError(null);

    const granted = await requestMicPermission();
    if (!granted) {
      setError(VOICE_COPY.micDenied);
      return false;
    }

    // Start capture while the user-gesture is still valid (before any long TTS await).
    if (PREFER_LOCAL_STT || !webSpeech.supported) {
      if (!isSpeakingRef.current && !isProcessingRef.current && !isRecordingRef.current) {
        await startRecording();
      }
      return true;
    }

    if (!webSpeech.listening) webSpeech.start();
    return true;
  }, [requestMicPermission, webSpeech, startRecording]);

  const ensureListening = useCallback(async () => {
    if (!conversationModeRef.current || !isActiveRef.current) return;
    if (phase === "scraping") return;
    if (isSpeakingRef.current || isTtsPlaying() || isProcessingRef.current || isRecordingRef.current) return;
    if (submitPauseTimerRef.current || webSpeechFinalRef.current.trim()) return;

    if (!micGrantedRef.current) {
      await startListening();
      return;
    }

    setError(null);

    if (PREFER_LOCAL_STT || !webSpeech.supported) {
      if (!isRecordingRef.current) await startRecording();
      return;
    }

    if (!webSpeech.listening) webSpeech.start();
    if (!previewStreamRef.current) await requestMicPermission();
  }, [phase, startListening, webSpeech, requestMicPermission, startRecording]);

  useEffect(() => {
    ensureListeningRef.current = ensureListening;
  }, [ensureListening]);

  const getWelcomeMessage = useCallback((): string | null => {
    if (phase === "onboarding") {
      return getOnboardingWelcomeMessage();
    }
    if (phase === "results" && Object.keys(facilities).length) {
      if (executiveSummary?.spokenSummary && resultsSource !== "instant") {
        return executiveSummary.spokenSummary;
      }
      const count = Object.keys(facilities).length;
      const proc = profile?.procedure || profile?.condition || "your care";
      const place = profile?.city?.trim() || profile?.zipCode || "your area";
      if (resultsSource === "instant") {
        return (
          `We already pulled real hospital price files near ${place} — ${count} places with prices for ${proc}. ` +
          `I'll walk you through your options. After that, you can watch how we searched or run a live scrape.`
        );
      }
      return (
        `All done — I found ${count} places with prices for ${proc}. ` +
        `I'll walk you through the best options. Ask me about cost, distance, or who's accredited.`
      );
    }
    return null;
  }, [phase, facilities, profile, executiveSummary, resultsSource]);

  /** Unlock TTS audio only — mic starts on explicit mic tap (user gesture). */
  const playWelcomeAudio = useCallback(async () => {
    if (welcomeInFlightRef.current) {
      await welcomeInFlightRef.current;
      return;
    }
    if (welcomeAudioPlayedRef.current) return;
    welcomeAudioPlayedRef.current = true;
    welcomeAudioPendingRef.current = false;

    const greeting = getWelcomeMessage();
    if (!greeting) return;

    clearError();
    const flight = speakWelcome(greeting);
    welcomeInFlightRef.current = flight;
    try {
      await flight;
      setMessages([{ id: "greet", role: "agent", text: greeting }]);
      setCaption(getOnboardingWelcomeCaption());
    } finally {
      welcomeInFlightRef.current = null;
    }
  }, [getWelcomeMessage, speakWelcome, clearError]);

  const seedWelcomeMessage = useCallback(() => {
    const greeting = getWelcomeMessage();
    if (!greeting || historyRef.current.length > 0) return;
    setMessages([{ id: "greet", role: "agent", text: "" }]);
    setCaption(VOICE_COPY.thinking);
    historyRef.current.push({ role: "assistant", content: greeting });
  }, [getWelcomeMessage]);

  const startVoiceSession = useCallback(async () => {
    setError(null);
    setIsActive(true);
    isActiveRef.current = true;

    if (historyRef.current.length === 0) {
      seedWelcomeMessage();
    }

    if (!spokenWelcomeRef.current) {
      spokenWelcomeRef.current = true;
      const greeting =
        historyRef.current.find((m) => m.role === "assistant")?.content ?? getWelcomeMessage();
      if (greeting) {
        setMessages([{ id: "greet", role: "agent", text: "" }]);
        await speakWelcome(greeting);
        setMessages([{ id: "greet", role: "agent", text: greeting }]);
      }
    }

    setCaption(VOICE_COPY.standby);
  }, [seedWelcomeMessage, getWelcomeMessage, speakWelcome]);

  const enableVoiceInput = useCallback(async () => {
    unlockAudioPlayback();
    setError(null);
    setIsActive(true);
    isActiveRef.current = true;
    conversationModeRef.current = true;
    micRequestedRef.current = true;

    // Acquire mic while the browser still has the user gesture.
    const granted = await requestMicPermission();
    if (!granted) {
      setError(VOICE_COPY.micDenied);
      return;
    }

    if (!welcomeAudioPlayedRef.current || welcomeInFlightRef.current) {
      await playWelcomeAudio();
    } else if (historyRef.current.length === 0) {
      seedWelcomeMessage();
    }

    if (!spokenWelcomeRef.current) {
      spokenWelcomeRef.current = true;
      const greeting = getWelcomeMessage();
      if (greeting) {
        setMessages((prev) =>
          prev.length ? prev : [{ id: "greet", role: "agent", text: greeting }]
        );
      }
    }

    await ensureListening();
  }, [
    requestMicPermission,
    playWelcomeAudio,
    seedWelcomeMessage,
    getWelcomeMessage,
    ensureListening,
  ]);

  const toggleVoiceInput = enableVoiceInput;

  const stopVoiceSession = useCallback(() => {
    if (listenResumeTimerRef.current) {
      clearTimeout(listenResumeTimerRef.current);
      listenResumeTimerRef.current = null;
    }
    stopAllVoice();
    stopRecording();
    vadCleanupRef.current?.();
    vadCleanupRef.current = null;
    webSpeech.abort();
    stopMicPreview();
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (submitPauseTimerRef.current) {
      clearTimeout(submitPauseTimerRef.current);
      submitPauseTimerRef.current = null;
    }
    webSpeechFinalRef.current = "";
    conversationModeRef.current = false;
    micGrantedRef.current = false;
    micRequestedRef.current = false;
    isActiveRef.current = false;
    setProcessing(false);
    setIsTranscribing(false);
    setIsActive(false);
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setIsListening(false);
    setMessages([]);
    historyRef.current = [];
    spokenWelcomeRef.current = false;
    welcomeInFlightRef.current = null;
    startedRef.current = false;
  }, [stopRecording, setProcessing, webSpeech, stopMicPreview]);

  /** Auto-welcome on load — show text immediately; audio plays on first tap. */
  useEffect(() => {
    if (!enabled || !autoStart) return;
    if (welcomeStartedRef.current || spokenWelcomeRef.current || welcomeInFlightRef.current) return;
    if (phase === "results" && Object.keys(facilities).length === 0) return;
    if (phase === "results" && !AGENTIC_RESULTS && !executiveSummary?.spokenSummary) return;
    const greeting = getWelcomeMessage();
    if (!greeting) return;

    welcomeStartedRef.current = true;
    spokenWelcomeRef.current = true;
    startedRef.current = true;
    isActiveRef.current = true;
    welcomeAudioPendingRef.current = phase === "onboarding";
    welcomeAudioPlayedRef.current = phase !== "onboarding";
    historyRef.current.push({ role: "assistant", content: greeting });

    const t = setTimeout(() => {
      clearError();
      setIsActive(true);
      setMessages([{ id: "greet", role: "agent", text: greeting }]);
      setCaption(VOICE_COPY.standby);
    }, 0);

    if (phase !== "onboarding") {
      welcomeInFlightRef.current = speakWelcome(greeting).then(() => {
        clearTimeout(t);
        setMessages([{ id: "greet", role: "agent", text: greeting }]);
        setCaption(VOICE_COPY.standby);
        welcomeInFlightRef.current = null;
      });
    }

    return () => clearTimeout(t);
  }, [enabled, autoStart, phase, facilities, executiveSummary, getWelcomeMessage, speakWelcome, clearError]);

  /** Unlock autoplay and play welcome on first tap anywhere. */
  useEffect(() => {
    if (!enabled || phase !== "onboarding" || !autoStart) return;
    const unlock = () => {
      unlockAudioPlayback();
      if (!welcomeAudioPlayedRef.current) {
        void playWelcomeAudio();
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [enabled, autoStart, phase, playWelcomeAudio]);

  useEffect(() => {
    return () => {
      stopRecordTimer();
      stopRecording();
      webSpeech.abort();
      stopMicPreview();
      if (submitPauseTimerRef.current) {
        clearTimeout(submitPauseTimerRef.current);
        submitPauseTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return {
    messages,
    caption,
    voiceState,
    activityLabel,
    isActive,
    isSpeaking,
    isListening,
    isProcessing,
    audioLevel,
    freqData,
    error,
    startVoiceSession,
    toggleVoiceInput,
    stopVoiceSession,
    sendTextFallback: sendText,
    clearError,
  };
}
