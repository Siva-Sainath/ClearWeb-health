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
import { VOICE_COPY, getOnboardingWelcomeMessage } from "@/lib/voiceCopy";
import { deriveVoiceState, resolveActivityLabel } from "@/lib/voiceState";
import type { VoiceState } from "@/lib/voiceState";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import {
  executeFacilityBook,
  executeFacilityCall,
} from "@/lib/facilityContact";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { speakTts, prefetchTts, speakOnboardingWelcome, prefetchWelcomeAudio, ensureTtsReady, speakTtsQueued } from "@/lib/ttsSpeak";
import { normalizeProfileUpdates, normalizeUserTranscript } from "@/lib/profileNormalize";
import { gateOnboardingProfileUpdates } from "@/lib/onboardingProfileGate";
import { EMPTY_PROFILE } from "@/lib/types";

const BACKEND =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"
    : "http://localhost:3001";

const USE_INSTANT_DEMO =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEMO_INSTANT_RESULTS !== "false";

/** Prevents duplicate onboarding welcome when React Strict Mode remounts the tree. */
let sharedOnboardingWelcome: Promise<void> | null = null;
let onboardingAutoWelcomeDone = false;
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
  } = options;

  useEffect(() => {
    if (enabled && autoStart && phase === "onboarding") {
      prefetchWelcomeAudio();
    }
  }, [enabled, autoStart, phase]);

  const [messages, setMessages] = useState<VapiMessage[]>([]);
  const [caption, setCaption] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
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
    if (!isSpeakingRef.current) setAudioLevel(0);
  }, []);

  const startRecordLevel = useCallback((stream: MediaStream) => {
    stopRecordLevel();
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setAudioLevel(Math.max(0.08, avg));
        recordLevelRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setAudioLevel(0.35);
    }
  }, [stopRecordLevel]);

  const stopSpeakLevelSim = useCallback(() => {
    if (speakLevelTimerRef.current) {
      clearInterval(speakLevelTimerRef.current);
      speakLevelTimerRef.current = null;
    }
    if (!isRecordingRef.current) setAudioLevel(0);
  }, []);

  const startSpeakLevelSim = useCallback(() => {
    stopSpeakLevelSim();
    speakLevelTimerRef.current = setInterval(() => {
      setAudioLevel(0.25 + Math.random() * 0.45);
    }, 80);
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

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
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

  const speakWithEdgeTTS = useCallback(
    async (text: string): Promise<void> => {
      const clean = stripTags(text);
      if (!clean) return;

      stopRecording();
      stopTtsAudio();

      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setCaption(VOICE_COPY.thinking);

      try {
        await speakTtsQueued(clean, {
          audioRef: ttsAudioRef,
          onPlaying: () => {
            setCaption(clean);
            startSpeakLevelSim();
          },
        });
      } finally {
        stopSpeakLevelSim();
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      }
    },
    [stopRecording, stopTtsAudio, startSpeakLevelSim, stopSpeakLevelSim]
  );

  const speakWelcome = useCallback(
    async (greeting: string) => {
      if (globalSpeakWelcomeLock) {
        await globalSpeakWelcomeLock;
        return;
      }

      const run = async () => {
        stopRecording();
        stopTtsAudio();
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        setCaption(VOICE_COPY.thinking);

        try {
          if (phase === "onboarding") {
            if (sharedOnboardingWelcome) {
              await sharedOnboardingWelcome;
              return;
            }
            const welcomeRun = speakOnboardingWelcome({
              audioRef: ttsAudioRef,
              onChunkStart: (_i, text) => setCaption(text),
              onPlaying: () => startSpeakLevelSim(),
            });
            sharedOnboardingWelcome = welcomeRun;
            await welcomeRun;
            sharedOnboardingWelcome = null;
          } else {
            prefetchTts(greeting);
            await ensureTtsReady(greeting);
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
    [phase, stopRecording, stopTtsAudio, startSpeakLevelSim, stopSpeakLevelSim]
  );

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
    [applyProfileFromAgent, onUIActions, onPhaseNavigate, onScrapeConfirm, facilities, onRouteFacility]
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

      applyParsedTags(fullText, { userMessage: msg, skipProfile: hasServerProfile });

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
    [applyParsedTags, applyProfileFromAgent, speakWithEdgeTTS]
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
      stopRecording();

      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);
      historyRef.current.push({ role: "user", content: trimmed });
      lastUserMessageRef.current = trimmed;
      setCaption(VOICE_COPY.thinking);
      setError(null);

      const uiContext = dashState ? buildUIStateContext(dashState) : "";

      try {
        const res = await fetch(`${BACKEND}/api/agent/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase,
            messages: historyRef.current,
            profile,
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
        const agentId = `a-${Date.now()}`;
        setMessages((prev) => [...prev, { id: agentId, role: "agent", text: "" }]);

        if (phase === "results" && executiveSummary) {
          const handledLocally = await handleDeterministicFollowUp(trimmed, agentId);
          if (handledLocally) return;
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            const json = JSON.parse(line.slice(6));
            if (json.token) {
              fullText += json.token;
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
    [phase, profile, facilities, dashState, handleAgentResponse, handleDeterministicFollowUp, executiveSummary, stopRecording, setProcessing]
  );

  sendTextRef.current = sendText;

  const startRecording = useCallback(async () => {
    if (isProcessingRef.current || isSpeakingRef.current || isRecordingRef.current) return;

    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
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
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        isRecordingRef.current = false;
        setIsListening(false);
        stopRecordLevel();

        const durationMs = Date.now() - recordStartRef.current;
        const blob = new Blob(recordChunksRef.current, { type: recordMimeRef.current });
        recordChunksRef.current = [];

        if (durationMs < 1200) {
          setCaption(VOICE_COPY.tooShort);
          return;
        }

        if (blob.size < 2000) {
          setCaption(VOICE_COPY.noAudio);
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
      startRecordLevel(stream);

      stopRecordTimer();
      recordTimerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - recordStartRef.current) / 1000);
        setCaption(VOICE_COPY.listeningSeconds(sec));
      }, 500);
    } catch {
      setError(VOICE_COPY.micDenied);
    }
  }, [stopRecording, stopRecordLevel, startRecordLevel, transcribeBlob, stopRecordTimer]);

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

    setCaption(VOICE_COPY.ready);
  }, [seedWelcomeMessage, getWelcomeMessage, speakWelcome]);

  const toggleVoiceInput = useCallback(async () => {
    setError(null);

    if (!isActiveRef.current) {
      await startVoiceSession();
      return;
    }

    if (isRecordingRef.current) {
      stopRecording();
      return;
    }

    if (!isSpeakingRef.current && !isProcessingRef.current) {
      await startRecording();
    }
  }, [startVoiceSession, startRecording, stopRecording]);

  const stopVoiceSession = useCallback(() => {
    stopAllVoice();
    stopRecording();
    isActiveRef.current = false;
    setProcessing(false);
    setIsTranscribing(false);
    setIsActive(false);
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setMessages([]);
    historyRef.current = [];
    spokenWelcomeRef.current = false;
    welcomeInFlightRef.current = null;
    startedRef.current = false;
  }, [stopRecording, setProcessing]);

  /** Auto-welcome: voice-first, then reveal text */
  useEffect(() => {
    if (!enabled || !autoStart) return;
    if (phase === "onboarding") {
      if (onboardingAutoWelcomeDone || sharedOnboardingWelcome || globalSpeakWelcomeLock) return;
      onboardingAutoWelcomeDone = true;
    }
    if (spokenWelcomeRef.current || welcomeInFlightRef.current) return;
    if (phase === "results" && Object.keys(facilities).length === 0) return;
    if (phase === "results" && !executiveSummary?.spokenSummary) return;
    const greeting = getWelcomeMessage();
    if (!greeting) return;

    spokenWelcomeRef.current = true;
    startedRef.current = true;
    setIsActive(true);
    isActiveRef.current = true;
    historyRef.current.push({ role: "assistant", content: greeting });
    setMessages([{ id: "greet", role: "agent", text: "" }]);
    setCaption(VOICE_COPY.thinking);

    void speakWelcome(greeting).then(() => {
      setMessages([{ id: "greet", role: "agent", text: greeting }]);
      setCaption(VOICE_COPY.ready);
    });
  }, [enabled, autoStart, phase, facilities, executiveSummary, getWelcomeMessage, speakWelcome]);

  useEffect(() => {
    return () => {
      stopRecordTimer();
      stopRecording();
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
    error,
    startVoiceSession,
    toggleVoiceInput,
    stopVoiceSession,
    sendTextFallback: sendText,
    clearError,
  };
}
