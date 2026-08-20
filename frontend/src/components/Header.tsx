"use client";

import { useAppContext } from "@/context/AppContext";
import { BRAND } from "@/lib/brand";

const PHASE_LABEL = {
  onboarding: "Onboarding",
  scraping: "Searching",
  results: "Results",
} as const;

export default function Header() {
  const {
    journeyPhase,
    scrapeStatus,
    isListening,
    isSpeaking,
    facilities,
    setJourneyPhase,
    setScrapeStatus,
    setFacilities,
    setScrapeJobId,
    setScrapeEvents,
    setExecutiveSummary,
    setScrapePresentationMode,
    setReplayEvents,
    setLlmExplanation,
  } = useAppContext();

  const facilityCount = Object.keys(facilities).length;

  const resetDemo = () => {
    setJourneyPhase("onboarding");
    setScrapeStatus("idle");
    setScrapePresentationMode(null);
    setReplayEvents([]);
    setFacilities({});
    setScrapeJobId(null);
    setScrapeEvents([]);
    setExecutiveSummary(null);
    setLlmExplanation(null);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#070D0A]/80 backdrop-blur-xl">
      <div className="container mx-auto px-6 h-14 flex items-center justify-between max-w-7xl">
        <button type="button" onClick={resetDemo} className="flex items-center gap-2.5 group text-left">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[#070D0A] font-semibold text-sm bg-gradient-to-br from-emerald-400 to-teal-300 transition-transform duration-200 group-hover:scale-[1.03]">
            C
          </div>
          <span className="font-semibold text-[15px] text-[#F2F9F5] tracking-[-0.02em]">
            {BRAND.nameParts.mark}{" "}
            <span className="text-emerald-400/90 font-medium">{BRAND.nameParts.medical}</span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          <span className="badge badge-neutral hidden sm:inline-flex">
            {PHASE_LABEL[journeyPhase]}
          </span>

          {scrapeStatus === "running" && (
            <span className="badge badge-live">
              <span className="badge-dot" />
              Crawling
            </span>
          )}

          {journeyPhase === "results" && facilityCount > 0 && (
            <span className="badge badge-accent">
              {facilityCount} {facilityCount === 1 ? "facility" : "facilities"}
            </span>
          )}

          {(isListening || isSpeaking) && (
            <span className="badge badge-voice">
              {isListening ? "Recording" : "Aria speaking"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
