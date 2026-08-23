"use client";

import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    const t = setTimeout(() => setReduced(mq.matches), 0);
    mq.addEventListener("change", handler);
    return () => {
      clearTimeout(t);
      mq.removeEventListener("change", handler);
    };
  }, []);

  return reduced;
}
