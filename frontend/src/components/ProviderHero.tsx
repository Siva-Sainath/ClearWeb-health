"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { MapPin, Star, ShieldCheck, Phone, ExternalLink } from "lucide-react";
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

interface ProviderHeroProps {
  option: RankedOption;
  savingsVsMax?: number;
  driveLabel?: string | null;
  onRoute?: () => void;
}

export default function ProviderHero({
  option,
  savingsVsMax,
  driveLabel,
  onRoute,
}: ProviderHeroProps) {
  const { facility, badge, reasons } = option;
  const phone = facilityDialPhone(facility);
  const canBook = hasBookAction(facility);
  const canCall = hasCallAction(facility);

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-emerald-500/25"
      style={{
        background: `linear-gradient(145deg, ${tokens.accentMuted} 0%, rgba(10,10,11,0.95) 55%)`,
      }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl"
          style={{ backgroundColor: tokens.accentGlow }}
        />
      </div>

      <div className="relative p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-4">
          {facility.photoUrl ? (
            <Image
              src={facility.photoUrl}
              alt=""
              width={72}
              height={72}
              className="rounded-xl object-cover shrink-0 border border-white/10"
            />
          ) : (
            <div
              className="w-[72px] h-[72px] rounded-xl shrink-0 flex items-center justify-center text-2xl font-serif"
              style={{ backgroundColor: tokens.surfaceRaised, color: tokens.accent }}
            >
              #
              {option.rank}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {badge && (
              <span
                className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full mb-2 inline-block"
                style={{ backgroundColor: tokens.accentMuted, color: tokens.accent }}
              >
                {badge}
              </span>
            )}
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[var(--color-text-primary)] leading-tight">
              {facility.hospital_name}
            </h2>
            <p className="text-2xl font-semibold mt-1" style={{ color: tokens.accent }}>
              ${facility.insurance_price}
              <span className="text-sm font-normal text-[var(--color-text-tertiary)] ml-2">
                with your plan
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1.5">
            <MapPin size={14} style={{ color: tokens.accent }} />
            {driveLabel ?? `${facility.distance_mi} mi`}
          </span>
          <span className="flex items-center gap-1.5">
            <Star size={14} style={{ color: tokens.warn }} />
            {facility.rating} stars
          </span>
          {facility.accredited && (
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} style={{ color: tokens.accent }} />
              Accredited
            </span>
          )}
        </div>

        {savingsVsMax != null && savingsVsMax > 0 && (
          <p className="text-sm" style={{ color: tokens.accentAlt }}>
            Save up to ${savingsVsMax} vs the highest option in your search
          </p>
        )}

        <ul className="space-y-1.5">
          {reasons.slice(0, 3).map((r) => (
            <li key={r} className="text-sm text-[var(--color-text-secondary)] flex gap-2">
              <span style={{ color: tokens.accent }}>•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 pt-1">
          {onRoute && (
            <Button variant="ghost" size="sm" onClick={onRoute} className="min-h-[44px]">
              <MapPin size={14} className="mr-1.5" />
              Route
            </Button>
          )}
          {canBook && (
            <Button
              size="sm"
              className="min-h-[44px]"
              onClick={() => executeFacilityBook(facility)}
            >
              <ExternalLink size={14} className="mr-1.5" />
              {bookingLabel(facility.bookingType)}
            </Button>
          )}
          {canCall && phone && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
              onClick={() => executeFacilityCall(facility)}
            >
              <Phone size={14} className="mr-1.5" />
              Call
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
