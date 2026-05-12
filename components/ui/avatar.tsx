import { cn } from "@/lib/utils";

// 6-tint palette from the proposal: light-blue, green, amber, red, indigo, slate.
// Used in stacked mechanic lists to differentiate avatars when no photo exists.
const tints = [
  "bg-blue-100 text-brand-blue-dark",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
  "bg-red-100 text-red-700",
  "bg-indigo-100 text-indigo-800",
  "bg-border-subtle text-slate-700",
] as const;

export interface AvatarProps {
  name: string;
  size?: number;
  /** Tint index for the initials background. Modulo'd by palette length. */
  tint?: number;
  /** When provided, renders the image instead of initials. */
  src?: string;
  className?: string;
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ name, size = 32, tint = 0, src, className }: AvatarProps) {
  const sizeStyle = { width: size, height: size, fontSize: Math.round(size * 0.38) };

  if (src) {
    // next/image isn't used here — Avatar is rendered in lists where the image
    // origin can vary (user uploads, third-party). Keep it as a plain <img>
    // and let pages wrap with next/image where they know the source.
    return (
      <img
        src={src}
        alt={name}
        style={sizeStyle}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      style={sizeStyle}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        tints[tint % tints.length],
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  );
}
