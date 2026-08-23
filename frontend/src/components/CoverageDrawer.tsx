"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, Stethoscope, Building2, Shield, X } from "lucide-react";
import {
  COVERAGE_ZIPS,
  COVERAGE_HOSPITALS,
  COVERAGE_PROCEDURES,
  COVERAGE_INSURERS,
  COVERAGE_CITIES,
} from "@/lib/coverageFacts";

interface CoverageDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CoverageDrawer({ open, onOpenChange }: CoverageDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close coverage"
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.aside
            role="dialog"
            aria-labelledby="coverage-title"
            initial={{ x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 28, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed right-0 top-0 z-[70] h-[100dvh] w-full max-w-md overflow-y-auto border-l border-emerald-500/20 bg-[#070D0A]/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/90">
                  What Aria can price
                </p>
                <h2 id="coverage-title" className="font-serif text-2xl text-[#F2F9F5] mt-1">
                  Austin coverage
                </h2>
                <p className="text-sm text-[#8BABA0] mt-1">{COVERAGE_CITIES}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-full p-2 text-[#8BABA0] hover:bg-white/5 hover:text-[#F2F9F5]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <section className="mb-5">
              <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-emerald-400/80 mb-2">
                <MapPin size={13} /> All ZIPs
              </h3>
              <p className="text-sm text-[#F2F9F5] leading-relaxed font-mono">
                {COVERAGE_ZIPS.join(" · ")}
              </p>
            </section>

            <section className="mb-5">
              <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-emerald-400/80 mb-2">
                <Building2 size={13} /> Hospitals in cache
              </h3>
              <ul className="text-sm text-[#F2F9F5] space-y-1">
                {COVERAGE_HOSPITALS.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </section>

            <section className="mb-5">
              <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-emerald-400/80 mb-2">
                <Stethoscope size={13} /> Scraped procedures
              </h3>
              <ul className="text-sm text-[#F2F9F5] space-y-1">
                {COVERAGE_PROCEDURES.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-emerald-400/80 mb-2">
                <Shield size={13} /> Payers in the MRF files
              </h3>
              <p className="text-sm text-[#F2F9F5] leading-relaxed">{COVERAGE_INSURERS.join(", ")}</p>
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
