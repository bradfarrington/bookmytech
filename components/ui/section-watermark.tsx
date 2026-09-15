import Image from "next/image";
import { cn } from "@/lib/utils";

// A large, washed-out Book My Tech mark in a section's bottom-right corner
// (Task 46). The section needs `relative overflow-hidden`, and its content
// `relative`, so the mark sits behind the content and is clipped at the edges.
export interface SectionWatermarkProps {
  /** The surface it sits on: `light` (default) or `dark` (navy / gradient). */
  tone?: "light" | "dark";
  className?: string;
}

export function SectionWatermark({ tone = "light", className }: SectionWatermarkProps) {
  return (
    <Image
      // The mark on its own (the 512px app icons carry the wordmark). It is
      // only 150px, but at this opacity the upscaling softness doesn't show.
      src="/favicon.png"
      alt=""
      aria-hidden
      width={150}
      height={150}
      // Served as-is: keeps a purely decorative image out of the image optimiser.
      unoptimized
      className={cn(
        "pointer-events-none absolute -bottom-24 -right-20 size-[320px] select-none sm:size-[440px]",
        tone === "light" ? "opacity-[0.05]" : "opacity-[0.07] brightness-0 invert",
        className,
      )}
    />
  );
}
