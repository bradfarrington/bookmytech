import { cn } from "@/lib/utils";

// A number plate to read, not type into: the yellow plate and blue GB badge of
// components/ui/reg-plate-input.tsx, sized for a card caption.

export function Plate({ registration, className }: { registration: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-[5px] border-[1.5px] border-text-primary bg-plate-yellow pl-0.5 pr-1.5 text-text-primary",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex h-[17px] items-center rounded-[3px] bg-brand-blue px-1 text-[8px] font-bold leading-none tracking-[0.06em] text-white"
      >
        GB
      </span>
      <span className="sr-only">Registration </span>
      <span className="whitespace-nowrap text-xs font-extrabold uppercase leading-none tracking-[0.05em]">
        {registration}
      </span>
    </span>
  );
}
