import { cn } from "@/lib/utils";

// UK reg-plate styled input. Yellow background, dark border, monospace tracking,
// blue GB badge stamped on the left. Real <input> (proposal renders a display-
// only block; task 01 specifies a real interactive input).
//
// Server-safe — accepts standard <input> props via ...rest. Validation lives
// in the page composite / server action, not here. Consumers wrap in a
// "use client" form when they need uncontrolled-to-controlled state.
export interface RegPlateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  /** Optional override for the placeholder. Defaults to a recognisable UK reg. */
  placeholder?: string;
  /** `md` (default) is the compact booking-flow plate; `lg` is the 60px marketing plate on the homepage's lookup boxes. */
  size?: "md" | "lg";
}

export function RegPlateInput({
  placeholder = "LB21 XYZ",
  size = "md",
  className,
  ...rest
}: RegPlateInputProps) {
  if (size === "lg") {
    return (
      <label
        className={cn(
          "flex h-[60px] min-w-0 items-stretch overflow-hidden rounded-[10px] border-2 border-surface-dark bg-plate-yellow shadow-[0_8px_24px_rgba(0,0,0,0.2)]",
          "focus-within:ring-2 focus-within:ring-white focus-within:ring-offset-2 focus-within:ring-offset-brand-blue-dark",
          className,
        )}
      >
        <span
          aria-hidden
          className="flex w-11 shrink-0 flex-col items-center justify-center gap-[3px] bg-brand-blue-dark text-[10px] font-bold tracking-[0.06em] text-white"
        >
          <span className="h-3 w-[18px] rounded-[2px] bg-[repeating-conic-gradient(#fbbf24_0deg_30deg,transparent_30deg_60deg)] opacity-70" />
          GB
        </span>
        <input
          type="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={8}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-4 font-['Arial_Black',sans-serif] text-[22px] font-black uppercase tracking-[0.06em] text-[#1a1a1a] outline-none placeholder:text-black/35 min-[521px]:text-[28px]"
          {...rest}
        />
      </label>
    );
  }

  return (
    <label
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md border-[1.5px] border-text-primary bg-plate-yellow px-3 text-text-primary",
        "focus-within:ring-2 focus-within:ring-brand-blue focus-within:ring-offset-2",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex flex-col items-center rounded-sm bg-brand-blue px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white leading-none"
      >
        GB
        <span className="text-[8px] opacity-85">★</span>
      </span>
      <input
        type="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={8}
        placeholder={placeholder}
        className={cn(
          "h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-extrabold uppercase tracking-[0.05em] outline-none placeholder:font-extrabold placeholder:text-text-primary/50",
        )}
        {...rest}
      />
    </label>
  );
}
