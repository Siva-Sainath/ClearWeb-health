"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  MapPin,
  Star,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Phone,
  ExternalLink,
  Navigation,
} from "lucide-react";
import type { RankedOption } from "@/lib/scrapeExecutiveSummary";
import {
  bookingLabel,
  executeFacilityBook,
  executeFacilityCall,
  facilityDialPhone,
  hasBookAction,
  hasCallAction,
} from "@/lib/facilityContact";
import { tokens } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";

interface ConsumerOptionCardProps {
  option: RankedOption;
  highlighted?: boolean;
  spotlight?: boolean;
  driveLabel?: string | null;
  onShowRoute?: () => void;
  onSpotlight?: () => void;
}

export default function ConsumerOptionCard({
  option,
  highlighted = false,
  spotlight = false,
  driveLabel,
  onShowRoute,
  onSpotlight,
}: ConsumerOptionCardProps) {
  const { facility, rank, badge, reasons } = option;
  const phone = facilityDialPhone(facility);
  const canBook = hasBookAction(facility);
  const canCall = hasCallAction(facility);
  const distanceLabel =
    driveLabel ?? `${facility.drive_min ? `~${Math.round(facility.drive_min)} min · ` : ""}${facility.distance_mi} mi`;

  return (
    <motion.article
      id={`facility-${facility.id ?? facility.hospital_name}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={`glass overflow-hidden rounded-2xl transition-all ${
        spotlight ? "ring-2 ring-[var(--color-accent)]/55" : ""
      }`}
      style={
        highlighted
          ? { borderColor: tokens.accentBorder, boxShadow: `0 12px 48px ${tokens.accentMuted}` }
          : undefined
      }
    >
      {facility.photoUrl && (
        <div className="relative h-36 sm:h-40 w-full">
          <Image
            src={facility.photoUrl}
            alt={`${facility.hospital_name} exterior`}
            fill
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0b] via-[#0a0a0b]/40 to-transparent" />
          {badge && (
            <span
              className="absolute top-3 left-3 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full backdrop-blur-md"
              style={{ backgroundColor: tokens.accentMuted, color: tokens.accent, border: `1px solid ${tokens.accentBorder}` }}
            >
              {badge}
            </span>
          )}
          <div className="absolute bottom-3 right-3 text-right">
            <p className="text-[10px] uppercase tracking-wider text-white/70">Your cost</p>
            <p className="text-2xl font-serif font-bold text-white drop-shadow-lg">
              ${facility.insurance_price}
            </p>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          {!facility.photoUrl && (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm"
              style={{
                backgroundColor: highlighted ? tokens.accentMuted : "rgba(255,255,255,0.06)",
                color: highlighted ? tokens.accent : "var(--color-text-secondary)",
                border: `1px solid ${highlighted ? tokens.accentBorder : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {rank}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {facility.photoUrl && (
                <span className="text-xs font-mono text-[var(--color-text-tertiary)]">#{rank}</span>
              )}
              <h3 className="font-semibold text-[var(--color-text-primary)] text-base leading-snug">
                {facility.hospital_name}
              </h3>
              {!facility.photoUrl && badge && (
                <span
                  className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: tokens.accentMuted, color: tokens.accent }}
                >
                  {badge}
                </span>
              )}
            </div>
            {facility.facilityType && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{facility.facilityType}</p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-[var(--color-text-tertiary)]">
              <span className="flex items-center gap-1">
                <MapPin size={12} /> {distanceLabel}
              </span>
              <span className="flex items-center gap-1">
                <Star size={12} /> {facility.rating}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> ~{facility.wait_days} days wait
              </span>
              <span className="flex items-center gap-1">
                {facility.accredited ? (
                  <ShieldCheck size={12} style={{ color: tokens.accent }} />
                ) : (
                  <ShieldAlert size={12} style={{ color: tokens.warn }} />
                )}
                {facility.accredited ? "Accredited" : "Unverified"}
              </span>
            </div>
            {facility.address && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5 truncate">{facility.address}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {facility.price_source === "mrf_scraped" && (
                <span className="badge badge-accent text-[10px]">Price from MRF</span>
              )}
              {facility.address_source === "mrf_scraped" && (
                <span className="badge badge-neutral text-[10px]">Address from MRF</span>
              )}
              {facility.mrf_last_updated && (
                <span className="badge badge-neutral text-[10px] font-mono">
                  MRF {facility.mrf_last_updated}
                </span>
              )}
            </div>
          </div>
          {!facility.photoUrl && (
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Your cost
              </p>
              <p className="text-2xl font-serif font-bold" style={{ color: tokens.accent }}>
                ${facility.insurance_price}
              </p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">Cash ${facility.cash_price}</p>
            </div>
          )}
        </div>

        {reasons.length > 0 && (
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed border-t border-white/[0.06] pt-3">
            {reasons.join(" · ")}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {canBook && (
            <Button
              type="button"
              variant="primary"
              className="flex-1 min-h-[44px] gap-2"
              title="Opens the hospital scheduling portal in a new tab"
              onClick={(e) => {
                e.stopPropagation();
                executeFacilityBook(facility);
              }}
            >
              <ExternalLink size={16} />
              {bookingLabel(facility.bookingType)}
            </Button>
          )}
          {canCall && (
            <Button
              type="button"
              variant={canBook ? "ghost" : "primary"}
              className="flex-1 min-h-[44px] gap-2"
              onClick={(e) => {
                e.stopPropagation();
                executeFacilityCall(facility);
              }}
            >
              <Phone size={16} />
              {canBook ? "Call direct" : bookingLabel(facility.bookingType)}
            </Button>
          )}
          {!canBook && !canCall && (
            <Button type="button" variant="ghost" disabled className="flex-1 min-h-[44px] opacity-50">
              Contact via main desk
            </Button>
          )}
          {onShowRoute && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-[44px] gap-2 sm:max-w-[140px]"
              onClick={(e) => {
                e.stopPropagation();
                onShowRoute();
              }}
            >
              <Navigation size={16} />
              Route
            </Button>
          )}
        </div>

        {phone && facility.phoneDepartment && (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            Direct: {facility.phoneDepartment}
            {facility.contactVerifiedAt && (
              <span className="opacity-70"> · contact verified</span>
            )}
          </p>
        )}

        {facility.photoAttribution && (
          <p className="text-[10px] text-[var(--color-text-tertiary)] opacity-60">{facility.photoAttribution}</p>
        )}

        {onSpotlight && (
          <button
            type="button"
            onClick={onSpotlight}
            className="text-xs font-medium w-full text-left pt-1"
            style={{ color: tokens.accent }}
          >
            Show on map →
          </button>
        )}
      </div>
    </motion.article>
  );
}
