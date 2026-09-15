import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

// Eyebrow + h2 + lead above a marketing section (Task 46 redesign). Every
// customer marketing page uses this rather than restating the classes — see
// docs/03-design-system.md → Marketing page pattern.
export interface SectionHeadingProps {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
  /** The surface the heading sits on: `light` (default) or `dark` (navy / gradient sections). */
  tone?: "light" | "dark";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
  tone = "light",
  className,
}: SectionHeadingProps) {
  const onDark = tone === "dark";
  return (
    <Reveal
      className={cn(
        align === "center" ? "mx-auto mb-14 max-w-[640px] text-center" : "mb-10 max-w-[720px]",
        className,
      )}
    >
      <p
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.14em]",
          onDark ? "text-blue-300" : "text-brand-blue",
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          "mb-3.5 mt-3 font-display text-[clamp(30px,4vw,46px)] font-extrabold leading-[1.05] tracking-[-0.025em]",
          onDark ? "text-white" : "text-text-primary",
        )}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            "text-[17px] leading-[1.55]",
            onDark ? "text-white/70" : "text-text-secondary",
          )}
        >
          {lead}
        </p>
      )}
    </Reveal>
  );
}
