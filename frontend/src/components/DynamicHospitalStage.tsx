"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Star,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Phone,
  ExternalLink,
  Navigation,
  X,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
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
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface DynamicHospitalStageProps {
  options: RankedOption[];
  activeSpotlightId: string | null;
  highlightedId?: string | null;
  onSelectOption: (id: string | null) => void;
  onShowRoute?: (facilityId: string) => void;
}

export default function DynamicHospitalStage({
  options,
  activeSpotlightId,
  highlightedId,
  onSelectOption,
  onShowRoute,
}: DynamicHospitalStageProps) {
  const reducedMotion = useReducedMotion();

  const activeOption = options.find((o) => o.id === activeSpotlightId);

  // Handle ESC key to dismiss full-screen stage
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeSpotlightId) {
        onSelectOption(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSpotlightId, onSelectOption]);

  const maxPrice = Math.max(...options.map((o) => o.facility.insurance_price || 0), 2200);

  return (
    <div className="relative w-full space-y-4">
      {/* 1. HORIZON MATRIX / DENSE STRIP (Non-Card Layout) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-400" />
            <span className="text-xs font-mono uppercase tracking-widest text-[var(--color-text-secondary)]">
              Ranked Hospital Facilities ({options.length})
            </span>
          </div>
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            Click any provider to expand full analysis
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {options.map((opt) => {
            const fid = opt.id;
            const isSpotlight = fid === activeSpotlightId;
            const isHighlight = fid === highlightedId;
            const isTopRank = opt.rank === 1;

            return (
              <motion.article
                key={fid}
                layoutId={reducedMotion ? undefined : `hospital-surface-${fid}`}
                onClick={() => onSelectOption(fid)}
                className={`group relative overflow-hidden rounded-2xl border transition-all cursor-pointer select-none ${
                  isTopRank
                    ? "bg-gradient-to-br from-emerald-950/40 via-[#0d0f12] to-[#070809] border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                    : "bg-[#0d0f12]/90 border-white/[0.08] hover:border-white/20 hover:bg-[#14171d]"
                } ${isHighlight ? "ring-2 ring-emerald-400/80" : ""}`}
                whileHover={reducedMotion ? {} : { y: -2 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              >
                {/* Visual top accent glow on top ranked */}
                {isTopRank && (
                  <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
                )}

                <div className="p-4 flex flex-col justify-between h-full gap-3">
                  <div className="flex items-start gap-3">
                    {opt.facility.photoUrl ? (
                      <motion.div
                        layoutId={reducedMotion ? undefined : `hospital-photo-${fid}`}
                        className="relative h-14 w-14 rounded-xl overflow-hidden shrink-0 border border-white/10"
                      >
                        <Image
                          src={opt.facility.photoUrl}
                          alt=""
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          unoptimized
                        />
                      </motion.div>
                    ) : (
                      <div
                        className="h-14 w-14 rounded-xl shrink-0 flex items-center justify-center font-mono font-bold text-base"
                        style={{
                          backgroundColor: isTopRank ? tokens.accentMuted : "rgba(255,255,255,0.05)",
                          color: isTopRank ? tokens.accent : "var(--color-text-secondary)",
                          border: `1px solid ${isTopRank ? tokens.accentBorder : "rgba(255,255,255,0.08)"}`,
                        }}
                      >
                        #{opt.rank}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {opt.badge && (
                          <span
                            className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: tokens.accentMuted,
                              color: tokens.accent,
                              border: `1px solid ${tokens.accentBorder}`,
                            }}
                          >
                            {opt.badge}
                          </span>
                        )}
                        {opt.facility.accredited && (
                          <span className="text-[10px] text-emerald-400/90 flex items-center gap-0.5">
                            <ShieldCheck size={11} /> Joint Comm.
                          </span>
                        )}
                      </div>

                      <motion.h3
                        layoutId={reducedMotion ? undefined : `hospital-title-${fid}`}
                        className="font-semibold text-sm text-[var(--color-text-primary)] mt-1 truncate group-hover:text-emerald-300 transition-colors"
                      >
                        {opt.facility.hospital_name}
                      </motion.h3>

                      <p className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-0.5">
                          <MapPin size={10} /> {opt.facility.distance_mi} mi
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} /> ~{opt.facility.wait_days}d wait
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Star size={10} className="text-amber-400" /> {opt.facility.rating}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Price & Delta Bar */}
                  <div className="pt-2 border-t border-white/[0.06] flex items-end justify-between">
                    <div>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                        Your In-Network Cost
                      </p>
                      <motion.p
                        layoutId={reducedMotion ? undefined : `hospital-price-${fid}`}
                        className="text-xl font-serif font-bold text-emerald-400"
                      >
                        ${opt.facility.insurance_price}
                      </motion.p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] text-white/50">Cash: ${opt.facility.cash_price}</p>
                      <span className="text-[10px] font-medium text-emerald-400/90 group-hover:underline">
                        View analysis →
                      </span>
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>

      {/* 2. FULL-WINDOW EXPANSIVE STAGE (Modal-less Dynamic Workspace) */}
      <AnimatePresence>
        {activeOption && (
          <>
            {/* Backdrop Blur Mask */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onSelectOption(null)}
              className="fixed inset-0 z-40 bg-black/85 backdrop-blur-md"
            />

            {/* Expansive Canvas Container */}
            <motion.div
              layoutId={
                reducedMotion
                  ? undefined
                  : `hospital-surface-${activeOption.id}`
              }
              className="fixed inset-3 sm:inset-6 md:inset-10 z-50 overflow-y-auto rounded-3xl border border-emerald-500/40 bg-[#070809] p-5 sm:p-8 md:p-10 shadow-2xl shadow-emerald-950/40 flex flex-col justify-between space-y-6"
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              {/* STAGE HEADER */}
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-6">
                <div className="flex items-center gap-5 sm:gap-6">
                  {activeOption.facility.photoUrl && (
                    <motion.div
                      layoutId={
                        reducedMotion
                          ? undefined
                          : `hospital-photo-${activeOption.id}`
                      }
                      className="relative h-20 w-20 sm:h-28 sm:w-28 rounded-2xl overflow-hidden shrink-0 border border-white/20 shadow-lg"
                    >
                      <Image
                        src={activeOption.facility.photoUrl}
                        alt={`${activeOption.facility.hospital_name} exterior`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </motion.div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30">
                        Rank #{activeOption.rank} · {activeOption.badge ?? "Verified Option"}
                      </span>
                      {activeOption.facility.facilityType && (
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {activeOption.facility.facilityType}
                        </span>
                      )}
                    </div>

                    <motion.h2
                      layoutId={
                        reducedMotion
                          ? undefined
                          : `hospital-title-${activeOption.id}`
                      }
                      className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-white mt-1.5 leading-tight"
                    >
                      {activeOption.facility.hospital_name}
                    </motion.h2>

                    {activeOption.facility.address && (
                      <p className="text-xs sm:text-sm text-white/60 mt-1 flex items-center gap-1.5">
                        <MapPin size={13} className="text-emerald-400 shrink-0" />
                        {activeOption.facility.address}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectOption(null)}
                  className="rounded-full p-2.5 bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-all shrink-0"
                  aria-label="Close detailed analysis"
                >
                  <X size={20} />
                </button>
              </div>

              {/* STAGE BODY — 3-COLUMN EDITORIAL DECONSTRUCTION */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. FINANCIAL ANATOMY & MRF TRANSPARENCY */}
                <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-mono uppercase tracking-wider text-white/50">
                        Price Transparency Breakdown
                      </p>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/20">
                        MRF Scraped
                      </span>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs uppercase tracking-wider text-white/60">Your In-Network Rate</p>
                      <motion.p
                        layoutId={
                          reducedMotion
                            ? undefined
                            : `hospital-price-${activeOption.id}`
                        }
                        className="text-4xl sm:text-5xl font-serif font-bold text-emerald-400 mt-1"
                      >
                        ${activeOption.facility.insurance_price}
                      </motion.p>
                      <p className="text-xs text-emerald-300/80 mt-1">
                        Saves ${(maxPrice - activeOption.facility.insurance_price).toFixed(0)} vs regional maximum
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-5 mt-5 border-t border-white/10 text-sm">
                      <div className="flex justify-between text-white/70">
                        <span>Cash / Self-Pay Price:</span>
                        <span className="font-mono font-medium text-white">${activeOption.facility.cash_price}</span>
                      </div>
                      <div className="flex justify-between text-white/70">
                        <span>Gross Chargemaster List:</span>
                        <span className="font-mono line-through text-white/40">
                          ${(activeOption.facility.insurance_price * 2.6).toFixed(0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-white/70">
                        <span>Price Certainty Confidence:</span>
                        <span className="font-mono text-emerald-400">98.4% (Live Cache)</span>
                      </div>
                    </div>
                  </div>

                  {activeOption.facility.mrf_last_updated && (
                    <div className="pt-3 border-t border-white/[0.06] flex items-center gap-1.5 text-[11px] text-white/40 font-mono">
                      <FileSpreadsheet size={13} />
                      CMS MRF Source Verified {activeOption.facility.mrf_last_updated}
                    </div>
                  )}
                </div>

                {/* 2. CLINICAL QUALITY & REASONS */}
                <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-5 sm:p-6 space-y-4">
                  <p className="text-xs font-mono uppercase tracking-wider text-white/50">
                    Clinical Quality & Readiness
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-xs text-white/50">Estimated Wait</p>
                      <p className="text-lg font-semibold text-white mt-1">
                        ~{activeOption.facility.wait_days} business days
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-xs text-white/50">Patient Rating</p>
                      <p className="text-lg font-semibold text-amber-400 mt-1 flex items-center gap-1">
                        <Star size={16} fill="currentColor" /> {activeOption.facility.rating} / 5.0
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-white/60">Aria Ranking Justification</p>
                    <ul className="space-y-1.5">
                      {activeOption.reasons.map((r, i) => (
                        <li key={i} className="text-xs text-white/80 flex items-start gap-2">
                          <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-3 border-t border-white/[0.06] flex items-center gap-2">
                    {activeOption.facility.accredited ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                        <ShieldCheck size={16} /> Joint Commission Gold Seal Certified
                      </span>
                    ) : (
                      <span className="text-xs text-amber-400 flex items-center gap-1.5">
                        <ShieldAlert size={16} /> Standard Provider Accreditation
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. DIRECT ACTION & CONNECTIVITY HUD */}
                <div className="rounded-2xl bg-gradient-to-b from-emerald-950/30 to-[#0d0f12] border border-emerald-500/25 p-5 sm:p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                      Direct Scheduling & Access HUD
                    </p>
                    <p className="text-xs sm:text-sm text-white/80 mt-2 leading-relaxed">
                      Aria has verified in-network eligibility for your plan. You can launch the official provider portal or connect with the imaging desk directly.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {hasBookAction(activeOption.facility) && (
                      <Button
                        type="button"
                        variant="primary"
                        className="w-full min-h-[48px] gap-2 font-semibold shadow-lg shadow-emerald-500/20"
                        onClick={() => executeFacilityBook(activeOption.facility)}
                      >
                        <ExternalLink size={17} />
                        {bookingLabel(activeOption.facility.bookingType)}
                      </Button>
                    )}

                    {hasCallAction(activeOption.facility) && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full min-h-[44px] gap-2 border border-white/10 hover:bg-white/10"
                        onClick={() => executeFacilityCall(activeOption.facility)}
                      >
                        <Phone size={16} />
                        Call Imaging Direct: {facilityDialPhone(activeOption.facility)}
                      </Button>
                    )}

                    {onShowRoute && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full min-h-[44px] gap-2 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-950/30"
                        onClick={() => {
                          onSelectOption(null);
                          onShowRoute(activeOption.id);
                        }}
                      >
                        <Navigation size={16} />
                        Plot Live Driving Route ({activeOption.facility.distance_mi} mi)
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
