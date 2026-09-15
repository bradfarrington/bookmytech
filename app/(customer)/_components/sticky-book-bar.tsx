"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { focusGetPrice } from "./get-price-button";

// Mobile-only "Get my price" bar on the homepage (Task 46). It slides away
// while a reg lookup form ([data-reg-lookup]) or the footer
// ([data-hide-sticky-bar]) is on screen, so it never covers the form it points
// at or the footer's legal links. It starts hidden: the hero form is in view on
// load, and the observer reports the real state on its first callback.
export function StickyBookBar() {
  const [covered, setCovered] = useState(true);

  useEffect(() => {
    const targets = document.querySelectorAll("[data-reg-lookup], [data-hide-sticky-bar]");
    if (targets.length === 0) return;
    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      setCovered(onScreen.size > 0);
    });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const visible = !covered;

  return (
    <div
      inert={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-3.5 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-[10px] md:hidden",
        "transition-transform duration-200 motion-reduce:transition-none",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-hidden
            className="shrink-0 rounded border-[1.5px] border-surface-dark bg-plate-yellow px-2 py-1 font-['Arial_Black',sans-serif] text-xs font-black tracking-[0.06em] text-[#1a1a1a]"
          >
            AB12 CDE
          </span>
          <p className="min-w-0 text-xs leading-[1.35] text-text-muted">
            <span className="block font-bold text-text-primary">Prices for your car</span>
            in 60 seconds
          </p>
        </div>
        <Button variant="primary" className="shrink-0 font-bold" onClick={focusGetPrice}>
          Get my price
        </Button>
      </div>
    </div>
  );
}
