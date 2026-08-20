/**
 * Facility contact helpers — consumes enrichment fields from an external pipeline.
 * Clearweb does NOT crawl contacts here; mock/API payloads supply these fields.
 */

import type { BookingType, FacilityResult } from "./types";

export function facilityDialPhone(f: FacilityResult): string | undefined {
  return f.phoneNumber || f.phone;
}

export function normalizeTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${phone}`;
}

export function bookingLabel(type?: BookingType): string {
  switch (type) {
    case "direct_portal":
      return "Book online";
    case "request_form":
      return "Request appointment";
    case "phone_only":
      return "Call scheduling";
    default:
      return "Book online";
  }
}

export function hasBookAction(f: FacilityResult): boolean {
  return !!(f.bookingUrl && f.bookingType !== "phone_only");
}

export function hasCallAction(f: FacilityResult): boolean {
  return !!facilityDialPhone(f);
}

export function executeFacilityCall(f: FacilityResult): boolean {
  const phone = facilityDialPhone(f);
  if (!phone) return false;
  window.location.href = normalizeTelHref(phone);
  return true;
}

export function executeFacilityBook(f: FacilityResult): boolean {
  if (!f.bookingUrl) return false;
  window.open(f.bookingUrl, "_blank", "noopener,noreferrer");
  return true;
}

export function contactSummaryForPrompt(f: FacilityResult): Record<string, unknown> {
  return {
    id: f.id,
    name: f.hospital_name,
    phoneNumber: facilityDialPhone(f),
    phoneDepartment: f.phoneDepartment,
    bookingUrl: f.bookingUrl,
    bookingType: f.bookingType ?? "phone_only",
    hasPhoto: !!f.photoUrl,
    driveMin: f.drive_min,
  };
}
