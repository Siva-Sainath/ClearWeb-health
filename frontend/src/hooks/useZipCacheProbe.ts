"use client";

import { useEffect, useState } from "react";
import type { PatientProfile } from "@/lib/types";
import { checkZipCache, type ZipCacheStatus } from "@/lib/zipCacheCheck";

export type ZipCacheProbeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; data: ZipCacheStatus }
  | { status: "error" };

export function useZipCacheProbe(profile: Pick<PatientProfile, "zipCode" | "radiusMi">) {
  const [state, setState] = useState<ZipCacheProbeState>({ status: "idle" });

  useEffect(() => {
    const zip = profile.zipCode?.trim();
    if (!zip || zip.length !== 5) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "checking" });

    const timer = setTimeout(() => {
      void (async () => {
        const data = await checkZipCache(profile);
        if (cancelled) return;
        if (!data) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", data });
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile.zipCode, profile.radiusMi]);

  return state;
}
