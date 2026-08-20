"use client";

import PatientView from "./PatientView";
import { useAppContext } from "@/context/AppContext";

export default function ViewContainer() {
  const { journeyPhase } = useAppContext();
  const lockScroll = journeyPhase === "scraping";

  return (
    <main
      className={`flex-1 min-h-0 w-full ${
        lockScroll ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"
      }`}
    >
      <PatientView />
    </main>
  );
}
