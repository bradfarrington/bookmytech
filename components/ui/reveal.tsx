"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export interface RevealProps {
  children: ReactNode;
  /** Element to render. Defaults to a div; pass "ul"/"ol" to wrap a list. */
  as?: ElementType;
  className?: string;
  /** Animate each direct child in sequence rather than the whole block at once. */
  stagger?: boolean;
  /** Distance (px) the content travels up into place. */
  y?: number;
  /** Seconds to wait before the animation starts. */
  delay?: number;
  /**
   * "scroll" (default) plays the reveal when the element scrolls into view;
   * "mount" plays it immediately — use for above-the-fold content like the hero.
   */
  trigger?: "scroll" | "mount";
}

// Shared entrance animation for the marketing pages. Wrap a block (or a list,
// with `stagger`) and it fades/slides in. Honours prefers-reduced-motion by
// leaving the content untouched, and degrades to fully-visible content with no
// JS (gsap only ever hides things once it's running on the client).
export function Reveal({
  children,
  as,
  className,
  stagger = false,
  y = 24,
  delay = 0,
  trigger = "scroll",
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const targets = stagger ? Array.from(root.children) : root;

      gsap.from(targets, {
        opacity: 0,
        y,
        duration: 0.7,
        ease: "power3.out",
        delay,
        stagger: stagger ? 0.09 : 0,
        ...(trigger === "scroll"
          ? { scrollTrigger: { trigger: root, start: "top 85%", once: true } }
          : {}),
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className}>
      {children}
    </Tag>
  );
}
