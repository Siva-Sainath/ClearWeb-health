"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { useDashboard } from "@/context/DashboardContext";
import type { FacilityResult } from "@/lib/types";
import type { DrivingRoute } from "@/hooks/useDrivingRoute";
import { facilitiesWithCoords, type LatLng } from "@/lib/facilityGeo";
import { tokens } from "@/lib/design-tokens";
import "leaflet/dist/leaflet.css";

interface Props {
  facilities: Record<string, FacilityResult>;
  zipCode?: string;
  userLocation?: LatLng | null;
  activeRoute?: DrivingRoute | null;
  routeTargetId?: string | null;
}

function spotlightIcon(active: boolean, accredited: boolean) {
  const color = active ? tokens.accent : accredited ? tokens.accentAlt : tokens.warn;
  const ring = active ? `0 0 0 3px ${tokens.accentGlow}` : "none";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:14px;height:14px;border-radius:9999px;
      background:${color};border:2px solid #0a0a0b;
      box-shadow:${ring}, 0 2px 8px rgba(0,0,0,0.45);
      transform: scale(${active ? 1.35 : 1});
      transition: transform 0.2s ease;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const userIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;border-radius:9999px;
    background:#38bdf8;border:3px solid #0a0a0b;
    box-shadow:0 0 0 4px rgba(56,189,248,0.35);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MapFocus({
  target,
  zoom,
  bounds,
}: {
  target: LatLng | null;
  zoom: number;
  bounds?: LatLng[] | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 1) {
      map.fitBounds(
        bounds.map((b) => [b.lat, b.lng] as [number, number]),
        { padding: [48, 48], maxZoom: 14 }
      );
      return;
    }
    if (target) {
      map.flyTo([target.lat, target.lng], zoom, { duration: 0.8 });
    }
  }, [map, target, zoom, bounds]);
  return null;
}

export default function FacilityMap({
  facilities,
  zipCode,
  userLocation,
  activeRoute,
  routeTargetId,
}: Props) {
  const { state, dispatch, filterFacilities } = useDashboard();
  const visible = filterFacilities(facilities);
  const points = useMemo(
    () => facilitiesWithCoords(visible, zipCode),
    [visible, zipCode]
  );

  const center = useMemo(() => {
    if (userLocation) return userLocation;
    if (!points.length) return { lat: 30.2672, lng: -97.7431 };
    const lat = points.reduce((s, p) => s + p.coords.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.coords.lng, 0) / points.length;
    return { lat, lng };
  }, [points, userLocation]);

  const focusTarget = useMemo(() => {
    const id = routeTargetId ?? state.spotlightId;
    if (!id) return null;
    return points.find((p) => p.id === id)?.coords ?? null;
  }, [state.spotlightId, routeTargetId, points]);

  const fitBounds = useMemo(() => {
    if (!activeRoute?.coordinates.length || !userLocation) return null;
    return [userLocation, ...activeRoute.coordinates.filter((_, i) => i % 8 === 0)];
  }, [activeRoute, userLocation]);

  if (!points.length) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-[var(--color-text-tertiary)] text-sm">
        No facilities match the current filter.
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/[0.06]">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[var(--color-text-primary)] text-base">Nearby facilities</h3>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            {userLocation ? "Route from your location · " : ""}
            OpenStreetMap
          </p>
        </div>
        {activeRoute && (
          <span className="badge badge-accent text-xs">
            {activeRoute.durationMin.toFixed(0)} min · {activeRoute.distanceMi.toFixed(1)} mi
          </span>
        )}
      </div>
      <div className="h-[380px] w-full [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:bg-[#0a0a0b]">
        <MapContainer center={[center.lat, center.lng]} zoom={11} scrollWheelZoom className="z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapFocus target={focusTarget} zoom={13} bounds={fitBounds} />

          {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
              <Popup>You are here</Popup>
            </Marker>
          )}

          {activeRoute && activeRoute.coordinates.length > 1 && (
            <Polyline
              positions={activeRoute.coordinates.map((c) => [c.lat, c.lng] as [number, number])}
              pathOptions={{ color: tokens.accent, weight: 4, opacity: 0.85 }}
            />
          )}

          {points.map(({ id, facility, coords }) => {
            const active = state.spotlightId === id || routeTargetId === id;
            const dimmed = (state.spotlightId != null || routeTargetId) && !active;
            return (
              <Marker
                key={id}
                position={[coords.lat, coords.lng]}
                icon={spotlightIcon(active, facility.accredited)}
                opacity={dimmed ? 0.45 : 1}
                eventHandlers={{
                  click: () => dispatch({ type: "spotlight", payload: id }),
                }}
              >
                <Popup>
                  <div className="text-sm min-w-[180px]">
                    <div className="font-semibold text-[#111]">{facility.hospital_name}</div>
                    <div className="text-emerald-700 font-bold text-lg mt-1">
                      ${facility.insurance_price}
                      <span className="text-xs font-normal text-gray-500"> with plan</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {facility.drive_min ? `~${Math.round(facility.drive_min)} min drive · ` : ""}
                      {facility.distance_mi} mi · {facility.rating}★
                    </div>
                    {facility.address && (
                      <div className="text-xs text-gray-500 mt-1">{facility.address}</div>
                    )}
                    {facility.address_source === "mrf_scraped" && (
                      <div className="text-[10px] text-emerald-700 mt-1">Address from hospital MRF</div>
                    )}
                    {facility.address && (
                      <a
                        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(facility.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-sky-700 underline mt-1 inline-block"
                      >
                        View on OpenStreetMap
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
