"use client";

import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "@/lib/facilityGeo";

export type UserLocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; coords: LatLng; label: string }
  | { status: "denied" }
  | { status: "unsupported" };

export function useUserLocation(enabled = true) {
  const [state, setState] = useState<UserLocationState>({ status: "idle" });

  const request = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported" });
      return;
    }
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: "ready",
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          label: "Your location",
        });
      },
      () => setState({ status: "denied" }),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 }
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => request(), 0);
    return () => clearTimeout(t);
  }, [enabled, request]);

  return { location: state, requestLocation: request };
}
