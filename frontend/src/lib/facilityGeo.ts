import type { FacilityResult } from "./types";

/** Demo anchor — replace with zip geocode when Bright Data returns only addresses */
const DEFAULT_CENTER = { lat: 30.2672, lng: -97.7431 };

const ZIP_CENTERS: Record<string, { lat: number; lng: number }> = {
  "78701": { lat: 30.2672, lng: -97.7431 },
  "78704": { lat: 30.2443, lng: -97.7697 },
  "78705": { lat: 30.291, lng: -97.738 },
  "78731": { lat: 30.354, lng: -97.755 },
  "78735": { lat: 30.258, lng: -97.865 },
  "78745": { lat: 30.205, lng: -97.791 },
  "78758": { lat: 30.385, lng: -97.705 },
  "78759": { lat: 30.395, lng: -97.75 },
  "94102": { lat: 37.7793, lng: -122.4193 },
  "10001": { lat: 40.7506, lng: -73.9971 },
};

export interface LatLng {
  lat: number;
  lng: number;
}

/** Use explicit coords from scrape payload, or derive a stable point from zip + distance. */
export function resolveFacilityCoords(
  facility: FacilityResult,
  zipCode?: string,
  index = 0
): LatLng {
  if (facility.lat != null && facility.lng != null) {
    return { lat: facility.lat, lng: facility.lng };
  }

  const center = (zipCode && ZIP_CENTERS[zipCode.slice(0, 5)]) || DEFAULT_CENTER;
  const mi = facility.distance_mi ?? 5;
  const km = mi * 1.60934;
  const bearing = (index * 72 + 18) * (Math.PI / 180);
  const lat = center.lat + (km / 111.32) * Math.cos(bearing);
  const lng =
    center.lng + (km / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(bearing);

  return { lat, lng };
}

export function facilitiesWithCoords(
  facilities: Record<string, FacilityResult>,
  zipCode?: string
): Array<{ id: string; facility: FacilityResult; coords: LatLng }> {
  return Object.entries(facilities).map(([id, facility], index) => ({
    id,
    facility,
    coords: resolveFacilityCoords(facility, zipCode, index),
  }));
}
