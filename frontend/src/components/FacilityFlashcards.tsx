"use client";

import React from "react";
import { motion } from "framer-motion";
import { MapPin, DollarSign, Star, Clock, Sparkles } from "lucide-react";
import type { FacilityInsight } from "@/lib/facilityInsights";

const ACCENT: Record<
  FacilityInsight["accent"],
  { icon: React.ReactNode; ring: string; text: string; bg: string }
> = {
  summary: {
    icon: <Sparkles size={14} />,
    ring: "border-white/10",
    text: "text-[#F2F9F5]",
    bg: "bg-white/[0.04]",
  },
  cost: {
    icon: <DollarSign size={14} />,
    ring: "border-emerald-500/25",
    text: "text-emerald-400",
    bg: "bg-emerald-500/[0.06]",
  },
  distance: {
    icon: <MapPin size={14} />,
    ring: "border-sky-500/25",
    text: "text-sky-400",
    bg: "bg-sky-500/[0.06]",
  },
  quality: {
    icon: <Star size={14} />,
    ring: "border-amber-500/25",
    text: "text-amber-400",
    bg: "bg-amber-500/[0.06]",
  },
  speed: {
    icon: <Clock size={14} />,
    ring: "border-violet-500/25",
    text: "text-violet-400",
    bg: "bg-violet-500/[0.06]",
  },
};

interface FacilityFlashcardsProps {
  insights: FacilityInsight[];
  onSelect?: (facilityId: string) => void;
  spotlightId?: string | null;
}

export default function FacilityFlashcards({
  insights,
  onSelect,
  spotlightId,
}: FacilityFlashcardsProps) {
  if (!insights.length) return null;

  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
      {insights.map((card, i) => {
        const style = ACCENT[card.accent];
        const active = spotlightId === card.facilityId;

        return (
          <motion.button
            key={card.id}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            onClick={() => onSelect?.(card.facilityId)}
            className={`text-left rounded-xl p-4 border transition-all duration-200 ${style.bg} ${style.ring} ${
              active
                ? "ring-1 ring-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
                : "hover:border-white/15 hover:bg-white/[0.06]"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`${style.text} opacity-90`}>{style.icon}</span>
              <span className="text-[11px] font-medium tracking-wide text-[#8BABA0] uppercase">
                {card.title}
              </span>
            </div>
            <div className={`text-2xl font-semibold tracking-tight mb-1 ${style.text}`}>
              {card.highlight}
            </div>
            <div className="text-sm font-medium text-[#F2F9F5] truncate">{card.subtitle}</div>
            <div className="text-xs text-[#6B8A7E] mt-1.5 leading-snug">{card.metric}</div>
          </motion.button>
        );
      })}
    </div>
  );
}
