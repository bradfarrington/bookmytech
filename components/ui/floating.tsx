"use client";

import { useEffect, useState, type CSSProperties, type RefObject } from "react";

// Positions a dropdown list against its trigger in a fixed layer, portalled out
// of the page flow (used by Select and Combobox). An absolutely positioned list
// is clipped by any ancestor with overflow hidden or auto — a rounded settings
// card, a table wrapper, a scrolling panel — which is how the admin pricing
// dropdown was cut off. A fixed layer in a portal escapes all of them.
//
// The list opens below the trigger, or above when there's clearly more room
// there, capped to the space available. It follows the trigger while anything
// scrolls or the window resizes. Inside a modal <dialog> the layer is portalled
// into the dialog itself, because the dialog sits in the browser's top layer,
// above anything portalled to <body>.

export interface FloatingLayout {
  /** Where to portal the list: the enclosing <dialog>, else <body>. */
  container: Element;
  /** Fixed position and size for the list. */
  style: CSSProperties;
}

const GAP = 4;
const VIEWPORT_MARGIN = 8;
const MIN_HEIGHT = 120;

export function useFloatingLayout(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  maxHeight: number,
): FloatingLayout | null {
  const [layout, setLayout] = useState<FloatingLayout | null>(null);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = anchor.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
        const above = rect.top - GAP - VIEWPORT_MARGIN;
        const openUp = below < Math.min(maxHeight, 200) && above > below;
        setLayout({
          container: el.closest("dialog") ?? document.body,
          style: {
            position: "fixed",
            left: rect.left,
            width: rect.width,
            maxHeight: Math.max(MIN_HEIGHT, Math.min(maxHeight, openUp ? above : below)),
            ...(openUp
              ? { bottom: window.innerHeight - rect.top + GAP }
              : { top: rect.bottom + GAP }),
          },
        });
      });
    };
    measure();
    // Capture phase, so scrolling any container (not just the window) repositions.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      // Forget the last position so a reopen never flashes at a stale spot.
      setLayout(null);
    };
  }, [anchor, open, maxHeight]);

  return open ? layout : null;
}
