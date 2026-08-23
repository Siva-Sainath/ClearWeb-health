// ─── Shared Types ────────────────────────────────────────────────────────────

export type JourneyPhase = "onboarding" | "scraping" | "results";
export type VoicePhase = "onboarding" | "scraping" | "results";

export type { VoiceState } from "@/lib/voiceState";
export type ScrapeStatus = "idle" | "running" | "complete" | "failed" | "cancelled";
/** How scrape visuals were produced */
export type ScrapePresentationMode =
  | "instant"
  | "proof-reel"
  | "replay"
  | "live"
  | null;
export type PatientPriority = "cost" | "distance" | "accreditation" | "wait";

export interface PatientProfile {
  condition: string;
  procedure?: string;
  cptCode?: string;
  insurance: string;
  city?: string;
  zipCode: string;
  radiusMi: number;
  documentNames: string[];
  priorities?: PatientPriority[];
}

export const EMPTY_PROFILE: PatientProfile = {
  condition: "",
  insurance: "",
  city: "",
  zipCode: "",
  radiusMi: 0,
  documentNames: [],
  priorities: [],
};
// ─── Agent Stream ────────────────────────────────────────────────────────────

export type NodeStatus = "idle" | "active" | "complete" | "broken" | "healing";

export interface SourceNode {
  id: string;
  domain: string;
  label: string;
  /** Short unique label on the radial map (avoids duplicate abbreviations). */
  shortLabel?: string;
  status: NodeStatus;
  x: number;
  y: number;
}

export interface ScraperLog {
  id: string;
  ts: string;
  collector_id: string;
  event:
    | "price_extracted"
    | "page_loaded"
    | "collector_started"
    | "mrf_downloaded"
    | "extraction_failed"
    | "rate_limited"
    | "heal_triggered"
    | "heal_resumed"
    | "heal_failed";
  facility_name: string;
  cpt_code: string;
  cash_price?: number;
  insurance_rate?: number;
  network: string;
  detail: string;
  discovery_source?: string;
  cache_hit?: boolean;
  download_source?: string;
  node_id?: string;
  hospital_id?: string;
}

// ─── Voice Agent ─────────────────────────────────────────────────────────────

export interface VapiMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  attachmentId?: string;
}

export type BookingType = "direct_portal" | "request_form" | "phone_only";

export interface FacilityContactInfo {
  /** E.164 or display dial string */
  phoneNumber?: string;
  phoneDepartment?: string;
  bookingUrl?: string;
  bookingType?: BookingType;
  contactVerifiedAt?: string;
}

export interface FacilityResult extends FacilityContactInfo {
  id?: string;
  hospital_name: string;
  distance_mi: number;
  drive_min?: number;
  accredited: boolean;
  network: string;
  cash_price: number;
  insurance_price: number;
  rating: number;
  wait_days: number;
  cpt_code?: string;
  procedure?: string;
  address?: string;
  /** @deprecated use phoneNumber */
  phone?: string;
  lat?: number;
  lng?: number;
  source_url?: string;
  scraped_at?: string;
  /** Where address/coords came from */
  address_source?: "mrf_scraped" | "mrf_scraped_no_geocode" | "static_metadata";
  price_source?: "mrf_scraped";
  mrf_last_updated?: string;
  payer_match?: string;
  /** From external enrichment service (Places, CMS, etc.) — not scraped here */
  photoUrl?: string;
  photoAttribution?: string;
  facilityType?: string;
}

export interface ScrapeJobResponse {
  jobId: string;
  status: ScrapeStatus;
  profile: PatientProfile;
  results: Record<string, FacilityResult>;
  count?: number;
  events?: ScraperLog[];
  stats?: { cacheHits: number; liveDownloads: number; totalDownloads: number };
  demoCacheEnabled?: boolean;
  elapsedMs?: number;
  error?: string;
}

export interface PageStateSnapshot {
  journeyPhase: JourneyPhase;
  voicePhase: VoicePhase;
  patientProfile: PatientProfile | null;
  scrapeStatus: ScrapeStatus;
  scrapeJobId: string | null;
  dashboard: Record<string, unknown> | null;
  facilityCount: number;
  topRecommendationId: string | null;
  isListening: boolean;
  isSpeaking: boolean;
  lastAgentMessage: string | null;
  timestamp: string;
}
