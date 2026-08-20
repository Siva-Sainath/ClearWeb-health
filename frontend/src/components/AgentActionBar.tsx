"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useDashboard } from "@/context/DashboardContext";
import { Bot, SlidersHorizontal, Filter, ArrowUpDown, Crosshair } from "lucide-react";

function ActionIcon({ lastAction }: { lastAction: string }) {
  const lower = lastAction.toLowerCase();
  if (lower.includes("filter")) return <Filter size={11} />;
  if (lower.includes("sort")) return <ArrowUpDown size={11} />;
  if (lower.includes("spotlight")) return <Crosshair size={11} />;
  if (lower.includes("switch") || lower.includes("view")) return <SlidersHorizontal size={11} />;
  return <Bot size={11} />;
}

export default function AgentActionBar() {
  const { state } = useDashboard();
  const visible = state.isThinking || !!state.lastAction;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -4 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2.5 px-4 py-2 mb-3 rounded-xl text-xs bg-emerald-500/[0.06] border border-emerald-500/15">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>

            {state.isThinking ? (
              <span className="text-emerald-400">Aria is thinking…</span>
            ) : state.lastAction ? (
              <span className="flex items-center gap-1.5 text-zinc-400">
                <ActionIcon lastAction={state.lastAction} />
                {state.lastAction}
              </span>
            ) : null}

            <div className="ml-auto flex items-center gap-1.5">
              {state.layoutMode !== "explore" && (
                <span className="badge badge-accent text-[9px]">{state.layoutMode}</span>
              )}
              {state.filterMode !== "none" && (
                <span className="badge badge-accent text-[9px]">Filter: {state.filterMode}</span>
              )}
              {state.spotlightId && (
                <span className="badge badge-accent text-[9px]">{state.spotlightId}</span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
