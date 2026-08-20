"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext } from "@/context/AppContext";
import { DashboardProvider } from "@/context/DashboardContext";
import { HERO_SUBTITLE, HERO_SUBTITLE_ACTIVE } from "@/lib/voiceCopy";
import VoiceOnboardingView from "./VoiceOnboardingView";
import ScrapeCanvas from "./ScrapeCanvas";
import ResultsView from "./ResultsView";
import AppStateBridge from "./AppStateBridge";
import WebcmdPollHandler from "./WebcmdPollHandler";
import DemoBootstrap from "./DemoBootstrap";

export default function PatientView() {
  const { journeyPhase, isListening, isSpeaking, lastAgentMessage } = useAppContext();
  const isFullscreen = journeyPhase === "scraping";
  const onboardingLive = journeyPhase === "onboarding" && (!!lastAgentMessage || isListening || isSpeaking);

  const subtitle =
    journeyPhase === "onboarding" && onboardingLive
      ? HERO_SUBTITLE_ACTIVE
      : HERO_SUBTITLE[journeyPhase];

  return (
    <DashboardProvider>
      <AppStateBridge />
      <WebcmdPollHandler />
      <DemoBootstrap />
      <div className="w-full min-h-full flex flex-col">
        <AnimatePresence>
          {!isFullscreen && !onboardingLive && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-center pt-14 pb-2 container mx-auto px-6 max-w-4xl"
            >
              <h1
                className="font-serif font-bold tracking-tight text-[var(--color-text-primary)] mb-4"
                style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.1 }}
              >
                Clear <span className="gradient-text">prices</span> from the web.
              </h1>
              <p className="text-[var(--color-text-secondary)] text-lg font-light max-w-xl mx-auto leading-relaxed">
                {subtitle}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={`flex-1 min-h-0 relative ${
            isFullscreen
              ? "overflow-hidden"
              : onboardingLive
                ? "container mx-auto px-4 max-w-4xl pb-8 overflow-y-auto"
                : journeyPhase === "results"
                  ? "w-full max-w-[min(100%,90rem)] mx-auto px-4 sm:px-6 lg:px-8 pb-16 overflow-y-auto"
                  : "container mx-auto px-6 max-w-3xl pb-16 overflow-y-auto"
          }`}
        >
          <AnimatePresence mode="wait">
            {journeyPhase === "onboarding" && (
              <motion.div
                key="onboarding"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35 }}
              >
                <VoiceOnboardingView />
              </motion.div>
            )}

            {journeyPhase === "scraping" && (
              <motion.div
                key="scraping"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex flex-col min-h-0 overflow-hidden bg-[var(--color-void)]"
              >
                <ScrapeCanvas />
              </motion.div>
            )}

            {journeyPhase === "results" && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
              >
                <ResultsView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </DashboardProvider>
  );
}
