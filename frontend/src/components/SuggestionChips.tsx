"use client";

import { motion } from "framer-motion";
import { tokens } from "@/lib/design-tokens";

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (label: string) => void;
  disabled?: boolean;
}

export default function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (!suggestions.length) return null;

  return (
    <div className="space-y-2" aria-label="Suggested follow-ups">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Try asking
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((label) => (
          <motion.button
            key={label}
            type="button"
            disabled={disabled}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(label)}
            className="min-h-[44px] px-4 py-2 rounded-full text-sm font-medium border transition-colors disabled:opacity-40"
            style={{
              borderColor: tokens.accentBorder,
              backgroundColor: tokens.accentMuted,
              color: tokens.accentAlt,
            }}
          >
            {label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
