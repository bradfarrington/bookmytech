// Custom duotone icon set for Book My Tech.
//
// Why this exists: the marketing surface leaned on stock lucide-react glyphs,
// which read as generic. These are hand-built, on-brand and *duotone* — the
// primary linework inherits `currentColor` (so it sits on light or dark
// surfaces) while accent shapes carry the brand blue. Accent elements set
// their own `color` via `text-brand-blue`, so their `currentColor` resolves
// independently of the parent's — that's what gives the two-tone look without
// hardcoding hex values. Pass `accentClassName` to retint accents on dark
// backgrounds (e.g. `text-white`).
import { cn } from "@/lib/utils";

export interface BrandIconProps {
  size?: number;
  className?: string;
  /** Override the accent colour (defaults to brand blue). */
  accentClassName?: string;
  title?: string;
}

function Svg({
  size = 28,
  className,
  title,
  children,
}: BrandIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Shield with a tick — vetting / DBS / trust. */
export function ShieldCheckIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 5 5.7v5.1c0 4.3 3 7.6 7 9.2 4-1.6 7-4.9 7-9.2V5.7z" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="m8.8 11.8 2.2 2.2 4.2-4.4"
      />
    </Svg>
  );
}

/** Award rosette with ribbon tails — warranty / guarantee. */
export function RosetteIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9 13.6 7.2 21l4.8-2.6L16.8 21 15 13.6" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="m9.7 8.9 1.6 1.6 3-3.1"
      />
    </Svg>
  );
}

/** Pound coin — transparent / fixed pricing, savings. */
export function PoundCoinIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="M13.6 8.2a2.4 2.4 0 0 0-3.8 1.9c0 1.3.3 2 0 3.2-.2.8-.7 1.4-1.2 1.7h5.8M9 11.9h3.4"
      />
    </Svg>
  );
}

/** Banknote with a pound mark — pay on completion / payouts. */
export function BanknoteIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2.2" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="M12.6 9.8a1.7 1.7 0 0 0-2.7 1.4c0 1 .2 1.5 0 2.3-.1.5-.4.9-.8 1.1h4"
      />
      <path d="M5.4 9.4h.01M18.6 14.6h.01" />
    </Svg>
  );
}

/** Calendar with a lightning bolt — same / next-day booking. */
export function CalendarBoltIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" />
      <path d="M3.5 9.4h17M8 3.2v3.4M16 3.2v3.4" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="M12.7 11.4 9.8 15.4h2.5l-.5 2.9 3-4h-2.4z"
      />
    </Svg>
  );
}

/** Spanner / wrench — servicing & repair. */
export function WrenchIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M15.6 5.2a4 4 0 0 0-5 5.1L4.5 16.4a2 2 0 0 0 2.8 2.8l6.1-6.1a4 4 0 0 0 5.1-5l-2.6 2.6-2.3-.4-.4-2.3z" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="m6.6 16.3.01.01"
      />
    </Svg>
  );
}

/** Car with a wheel accent — your vehicle / at your door. */
export function CarIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M3 13.5 4.7 9a2.2 2.2 0 0 1 2-1.4h6.6a2.2 2.2 0 0 1 2 1.4l1.7 4.5" />
      <path d="M3 13.5h18v3.2a1.2 1.2 0 0 1-1.2 1.2H18M9 17.9H6.2A1.2 1.2 0 0 1 5 16.7v-3.2" />
      <path d="M9 17.9h6" />
      <circle className={cn("text-brand-blue", accentClassName)} cx="7" cy="17.9" r="1.6" />
      <circle className={cn("text-brand-blue", accentClassName)} cx="17" cy="17.9" r="1.6" />
    </Svg>
  );
}

/** Location pin with a dot — coverage area / on your doorstep. */
export function MapPinIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21c4-4 6.5-7.1 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 13.9 8 17 12 21z" />
      <circle className={cn("text-brand-blue", accentClassName)} cx="12" cy="10.4" r="2.4" />
    </Svg>
  );
}

/** Star — ratings / reviews. */
export function StarIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
      />
    </Svg>
  );
}

/** Headset — support / contact. */
export function HeadsetIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1" />
      <path d="M4.5 17.5v-4.7A1.3 1.3 0 0 1 5.8 11.5h.9a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-.9a1.3 1.3 0 0 1-1.3-1.5zM19.5 12.8v4.7a1.3 1.3 0 0 1-1.3 1.3h-.9a1 1 0 0 1-1-1V13.5a1 1 0 0 1 1-1h.9a1.3 1.3 0 0 1 1.3 1.3z" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="M18 18.5a3.5 3.5 0 0 1-3.2 2.1H12"
      />
    </Svg>
  );
}

/** Clock — speed / turnaround. */
export function ClockIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="M12 7.5V12l3 2"
      />
    </Svg>
  );
}

/** Phone running the mechanic app — everything in one place. */
export function SmartphoneIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
      <path d="M10.4 5.2h3.2" />
      <circle className={cn("text-brand-blue", accentClassName)} cx="12" cy="18.2" r="1.1" />
    </Svg>
  );
}

/** Clipboard with a tick — applications / checklists. */
export function ClipboardCheckIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4.5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="3.4" rx="1.1" />
      <path className={cn("text-brand-blue", accentClassName)} d="m9 14 2 2 4-4" />
    </Svg>
  );
}

/** Rocket — go live / launch / earn. */
export function RocketIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M12 2.6c2.7 1.4 4.3 4.2 4.3 7.7 0 1.7-.4 3.2-1.1 4.5H8.8c-.7-1.3-1.1-2.8-1.1-4.5 0-3.5 1.6-6.3 4.3-7.7z" />
      <path d="M8.8 14.8 6.8 16.8M15.2 14.8 17.2 16.8" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="M9.6 18.4c.7 1.3 1.5 2.2 2.4 2.7.9-.5 1.7-1.4 2.4-2.7"
      />
      <circle className={cn("text-brand-blue", accentClassName)} cx="12" cy="9.4" r="1.5" />
    </Svg>
  );
}

/** Chat bubble with a tick — messaging / kept in the loop. */
export function ChatCheckIcon({ accentClassName, ...p }: BrandIconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.2V16.5H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5z" />
      <path
        className={cn("text-brand-blue", accentClassName)}
        d="m8.5 10.8 2.1 2.1 4.4-4.4"
      />
    </Svg>
  );
}
