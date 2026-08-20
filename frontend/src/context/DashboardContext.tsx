"use client";

/**
 * DashboardContext — Global agent-controlled UI state.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { TabId, SortMode, FilterMode, UIAction, LayoutMode } from "@/lib/uiActions";
import { expandUIActions } from "@/lib/uiActions";
import type { FacilityResult } from "@/lib/types";

export interface DashboardState {
  activeTab: TabId;
  layoutMode: LayoutMode;
  spotlightId: string | null;
  highlightId: string | null;
  filterMode: FilterMode;
  sortMode: SortMode;
  compareA: string | null;
  compareB: string | null;
  shownCards: string[];
  revealedFacilities: string[];
  isThinking: boolean;
  lastAction: string | null;
}

const INITIAL: DashboardState = {
  activeTab: "map",
  layoutMode: "explore",
  spotlightId: null,
  highlightId: null,
  filterMode: "none",
  sortMode: "price",
  compareA: null,
  compareB: null,
  shownCards: [],
  revealedFacilities: [],
  isThinking: false,
  lastAction: null,
};

const LAYOUT_LABELS: Record<LayoutMode, string> = {
  explore: "Explore view",
  chartFocus: "Chart focus",
  compareSplit: "Compare split",
  mapRoute: "Map & route",
  spotlightHero: "Provider spotlight",
  savingsStory: "Savings story",
  trustGaps: "Trust & gaps",
};

function reducer(
  state: DashboardState,
  action: UIAction | { type: "SET_THINKING"; payload: boolean }
): DashboardState {
  switch (action.type) {
    case "tab":
      return { ...state, activeTab: action.payload, lastAction: `Switched to ${action.payload} view` };
    case "layout":
      return {
        ...state,
        layoutMode: action.payload,
        lastAction: LAYOUT_LABELS[action.payload] ?? action.payload,
      };
    case "spotlight":
      return {
        ...state,
        spotlightId: action.payload === state.spotlightId ? null : action.payload,
        lastAction: "Spotlighting facility",
      };
    case "highlight":
      return {
        ...state,
        highlightId: action.payload,
        lastAction: "Highlighting option",
      };
    case "reveal":
      return {
        ...state,
        revealedFacilities: state.revealedFacilities.includes(action.payload)
          ? state.revealedFacilities
          : [...state.revealedFacilities, action.payload],
        lastAction: "Revealing option",
      };
    case "filter":
      return { ...state, filterMode: action.payload, lastAction: `Filter: ${action.payload}` };
    case "sort":
      return { ...state, sortMode: action.payload, lastAction: `Sorted by ${action.payload}` };
    case "compare":
      return {
        ...state,
        activeTab: "compare",
        layoutMode: "compareSplit",
        compareA: action.facilityA,
        compareB: action.facilityB,
        lastAction: "Comparing two facilities",
      };
    case "show_card":
      return {
        ...state,
        shownCards: state.shownCards.includes(action.payload)
          ? state.shownCards
          : [...state.shownCards, action.payload],
        revealedFacilities: state.revealedFacilities.includes(action.payload)
          ? state.revealedFacilities
          : [...state.revealedFacilities, action.payload],
        lastAction: "Showing price card",
      };
    case "reset":
      return { ...INITIAL, lastAction: "Reset dashboard" };
    case "SET_THINKING":
      return { ...state, isThinking: action.payload };
    default:
      return state;
  }
}

interface DashboardContextValue {
  state: DashboardState;
  dispatch: (action: UIAction | { type: "SET_THINKING"; payload: boolean }) => void;
  applyActions: (actions: UIAction[]) => void;
  filterFacilities: (all: Record<string, FacilityResult>) => Record<string, FacilityResult>;
  sortFacilities: (entries: [string, FacilityResult][]) => [string, FacilityResult][];
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const applyActions = useCallback((actions: UIAction[]) => {
    const expanded = expandUIActions(actions);
    expanded.forEach((a) => dispatch(a));
  }, []);

  const filterFacilities = useCallback(
    (all: Record<string, FacilityResult>): Record<string, FacilityResult> => {
      if (state.filterMode === "none") return all;
      return Object.fromEntries(
        Object.entries(all).filter(([, f]) => {
          if (state.filterMode === "accredited") return f.accredited;
          if (state.filterMode === "close") return f.distance_mi <= 10;
          if (state.filterMode === "cheap") return f.insurance_price <= 400;
          return true;
        })
      );
    },
    [state.filterMode]
  );

  const sortFacilities = useCallback(
    (entries: [string, FacilityResult][]): [string, FacilityResult][] => {
      return [...entries].sort(([, a], [, b]) => {
        if (state.sortMode === "price") return a.insurance_price - b.insurance_price;
        if (state.sortMode === "distance") return a.distance_mi - b.distance_mi;
        if (state.sortMode === "rating") return b.rating - a.rating;
        if (state.sortMode === "wait") return a.wait_days - b.wait_days;
        return 0;
      });
    },
    [state.sortMode]
  );

  return (
    <DashboardContext.Provider value={{ state, dispatch, applyActions, filterFacilities, sortFacilities }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
