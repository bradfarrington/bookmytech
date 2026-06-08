"use client";

import { useEffect, useState } from "react";

const KEY = "bmt-sidebar-collapsed";

// Persisted collapse state for the desktop sidebars (admin + mechanic). Starts
// expanded on the server render to avoid a hydration mismatch, then syncs to the
// saved preference on mount. Shared so both sidebars behave identically.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  }

  return { collapsed, toggle };
}
