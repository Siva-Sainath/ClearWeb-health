"use client";

import { useEffect, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import { useScrapeJob } from "@/hooks/useScrapeJob";
import { AUSTIN_DEMO_SNAPSHOT } from "@/lib/demoSnapshot";

const SKIP_ONBOARDING =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_SKIP_ONBOARDING !== "false";

/**
 * Demo entry: skip voice onboarding and jump straight into scrape → results flow.
 */
export default function DemoBootstrap() {
  const { journeyPhase, setPatientProfile } = useAppContext();
  const { startDemoScrapeFlow } = useScrapeJob();
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!SKIP_ONBOARDING || bootedRef.current) return;
    if (journeyPhase !== "onboarding") return;

    bootedRef.current = true;
    const profile = { ...AUSTIN_DEMO_SNAPSHOT.profile };
    setPatientProfile(profile);
    startDemoScrapeFlow(profile);
  }, [journeyPhase, setPatientProfile, startDemoScrapeFlow]);

  return null;
}
