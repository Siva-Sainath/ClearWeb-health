"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/facilityGeo";

export interface DrivingRoute {
  coordinates: LatLng[];
  distanceMi: number;
  durationMin: number;
}

export function useDrivingRoute(
  from: LatLng | null,
  to: LatLng | null,
  enabled = true
) {
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !from || !to) {
      const t = setTimeout(() => setRoute(null), 0);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);

    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const leg = data.routes?.[0];
        if (!leg) {
          setError("Route unavailable");
          setRoute(null);
          return;
        }
        const coords: LatLng[] = leg.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => ({ lat, lng })
        );
        setRoute({
          coordinates: coords,
          distanceMi: leg.distance / 1609.34,
          durationMin: leg.duration / 60,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load route");
          setRoute(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [from, to, enabled]);

  return { route, loading, error };
}
