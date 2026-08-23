import type { PatientProfile } from "@/lib/types";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export type ZipCacheStatus = {
  cached: boolean;
  hospitalCount: number;
  zipKnown: boolean;
  zip: string;
  radiusMi: number;
};

export async function checkZipCache(
  profile: Pick<PatientProfile, "zipCode" | "radiusMi">
): Promise<ZipCacheStatus | null> {
  const zip = profile.zipCode?.trim();
  if (!zip || zip.length !== 5) return null;

  const radius = profile.radiusMi > 0 ? profile.radiusMi : 25;
  try {
    const params = new URLSearchParams({ zip, radius: String(radius) });
    const res = await fetch(`${BACKEND}/api/prices/cache-check?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as ZipCacheStatus;
  } catch {
    return null;
  }
}
