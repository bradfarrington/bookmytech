import Link from "next/link";
import { ChevronLeft, ChevronRight, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The customer dashboard's building blocks (Task 48), drawn from the app
// redesign in mockups/ so the website and the app look the same: cards, icon
// tiles, uppercase status pills, list rows, the screen header with a back
// chevron. Presentational only, with no hooks, so server and client
// components can both use them.

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * One screen's column. `narrow` is a phone-width reading column for forms and
 * detail screens; `wide` gives Home room for a side column on a desktop.
 */
export function Screen({
  children,
  width = "narrow",
  className,
}: {
  children: React.ReactNode;
  width?: "narrow" | "wide";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pb-16 pt-2 sm:px-6",
        width === "wide" ? "max-w-5xl" : "max-w-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Vertical rhythm between a screen's blocks: the mockups' 14px. */
export function Stack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3.5", className)}>{children}</div>;
}

/** The screen header: optional back chevron, a title, and an optional action on the right. */
export function PageHeader({
  title,
  backHref,
  backLabel = "Back",
  action,
}: {
  title: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-border-subtle hover:text-text-primary"
          >
            <ChevronLeft size={22} aria-hidden />
          </Link>
        )}
        <h1 className="truncate font-display text-[17px] font-bold tracking-[-0.3px] text-text-primary md:text-xl">
          {title}
        </h1>
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export function Overline({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted", className)}>
      {children}
    </div>
  );
}

/** A block with an overline label above it: "Upcoming", "Your details". */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Overline>{title}</Overline>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-xs leading-4 text-text-muted", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export type PanelTone = "default" | "tint" | "float" | "live" | "warn" | "danger" | "dark" | "selected";

const PANEL_TONES: Record<PanelTone, string> = {
  default: "border border-border bg-surface-card shadow-card",
  tint: "border border-blue-100 bg-blue-50 shadow-card",
  float: "border border-transparent bg-surface-card shadow-float",
  live: "overflow-hidden border-[1.5px] border-brand-blue bg-surface-card shadow-float",
  warn: "border border-amber-200 bg-amber-50",
  danger: "border border-red-200 bg-red-50",
  dark: "border border-transparent bg-surface-dark text-white shadow-float",
  selected: "border-[1.5px] border-brand-blue bg-blue-50",
};

const PANEL_PADDING = { none: "overflow-hidden", md: "p-3.5", lg: "p-[18px]" } as const;

/** The mockups' `.card`. */
export function Panel({
  children,
  tone = "default",
  padding = "md",
  className,
}: {
  children: React.ReactNode;
  tone?: PanelTone;
  padding?: keyof typeof PANEL_PADDING;
  className?: string;
}) {
  return <div className={cn("rounded-2xl", PANEL_TONES[tone], PANEL_PADDING[padding], className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Icon tiles, pills, dots, stars
// ---------------------------------------------------------------------------

export type TileTone = "brand" | "solid" | "dark" | "warn" | "danger" | "success" | "avatar" | "neutral";

const TILE_TONES: Record<TileTone, string> = {
  brand: "bg-blue-50 text-brand-blue",
  solid: "bg-brand-blue text-white",
  dark: "bg-text-primary text-white",
  warn: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  success: "bg-green-100 text-green-700",
  avatar: "bg-blue-100 font-display text-[15px] font-bold text-brand-blue-dark",
  neutral: "bg-border-subtle text-text-secondary",
};

const TILE_SIZES = {
  sm: { box: "size-8 rounded-lg", icon: 16 },
  md: { box: "size-10 rounded-[10px]", icon: 20 },
  lg: { box: "size-12 rounded-xl", icon: 22 },
  xl: { box: "size-14 rounded-[14px]", icon: 28 },
} as const;

/** A rounded-square icon (or initial) tile: the mockups' `.tile`. */
export function Tile({
  icon: Icon,
  tone = "brand",
  size = "md",
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: TileTone;
  size?: keyof typeof TILE_SIZES;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = TILE_SIZES[size];
  return (
    <div className={cn("flex shrink-0 items-center justify-center", s.box, TILE_TONES[tone], className)}>
      {Icon ? <Icon size={s.icon} strokeWidth={2} aria-hidden /> : children}
    </div>
  );
}

/** A person's photo in a tile, or their initial. */
export function AvatarTile({
  name,
  src,
  size = "lg",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={cn("shrink-0 object-cover", TILE_SIZES[size].box, className)} />
    );
  }
  return (
    <Tile tone="avatar" size={size} className={className}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </Tile>
  );
}

export type PillTone = "active" | "success" | "pending" | "error" | "neutral" | "dark" | "outline";

const PILL_TONES: Record<PillTone, string> = {
  active: "bg-blue-100 text-brand-blue-dark",
  success: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  neutral: "bg-border-subtle text-slate-700",
  dark: "bg-text-primary text-white",
  outline: "border border-brand-blue bg-surface-card text-brand-blue",
};

/** Uppercase status pill: the mockups' `.pill`. `pulse` adds the live dot. */
export function StatusPill({
  tone = "neutral",
  pulse,
  children,
  className,
}: {
  tone?: PillTone;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em]",
        PILL_TONES[tone],
        className,
      )}
    >
      {pulse && <span className="size-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none" />}
      {children}
    </span>
  );
}

/** The green "live" dot. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full bg-success animate-pulse motion-reduce:animate-none", className)}
    />
  );
}

/** Blue when unread, grey when read. */
export function UnreadDot({ unread, className }: { unread: boolean; className?: string }) {
  return (
    <span
      aria-label={unread ? "Unread" : undefined}
      className={cn("inline-block size-2 shrink-0 rounded-full", unread ? "bg-brand-blue" : "bg-slate-300", className)}
    />
  );
}

export function StarRating({ value, size = 12, className }: { value: number; size?: number; className?: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span aria-label={`${value} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          aria-hidden
          className={i < filled ? "fill-warning text-warning" : "fill-border text-border"}
          strokeWidth={0}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "dark" | "outline-danger";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-blue text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:bg-brand-blue-dark",
  secondary: "border-[1.5px] border-brand-blue bg-surface-card text-brand-blue hover:bg-blue-50",
  ghost: "bg-transparent text-text-secondary hover:bg-border-subtle hover:text-text-primary",
  destructive: "bg-danger text-white hover:bg-red-600",
  dark: "bg-text-primary text-white hover:bg-slate-800",
  "outline-danger": "border-[1.5px] border-red-200 bg-surface-card text-red-700 hover:bg-red-50",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-2.5 text-[12.5px]",
  md: "h-11 rounded-[10px] px-3.5 text-sm",
  lg: "h-[52px] rounded-[10px] px-4 text-[15px]",
};

/** Classes for a mockup button, for a <button> or <Link> you render yourself. */
export function buttonClass({
  variant = "primary",
  size = "md",
  full = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold tracking-[-0.1px] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    full && "w-full",
    className,
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  full,
  icon: Icon,
  children,
  className,
  prefetch,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonClass({ variant, size, full, className })}>
      {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.2} aria-hidden />}
      {children}
    </Link>
  );
}

export function Button({
  variant,
  size,
  full,
  icon: Icon,
  children,
  className,
  type = "button",
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <button type={type} className={buttonClass({ variant, size, full, className })} {...rest}>
      {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.2} aria-hidden />}
      {children}
    </button>
  );
}

/** A text link styled like the mockups' small blue links ("Book again", "Mark all read"). */
export function TextLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("text-xs font-semibold text-brand-blue hover:text-brand-blue-dark", className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** A card of rows divided by hairlines: the mockups' `.card.pad-none` + `.list-row`. */
export function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Panel padding="none" className={cn("divide-y divide-border-subtle", className)}>
      {children}
    </Panel>
  );
}

/**
 * One row: an optional tile, a title with a caption, and something on the
 * right. With `href` the whole row is a link and gets a chevron unless
 * `trailing` is given.
 */
export function ListRow({
  href,
  icon,
  tone,
  leading,
  title,
  caption,
  trailing,
  chevron,
  className,
  titleClassName,
}: {
  href?: string;
  icon?: LucideIcon;
  tone?: TileTone;
  leading?: React.ReactNode;
  title: React.ReactNode;
  caption?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  className?: string;
  titleClassName?: string;
}) {
  const body = (
    <>
      {leading ?? (icon ? <Tile icon={icon} tone={tone} /> : null)}
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-bold leading-[21px] text-text-primary", titleClassName)}>{title}</div>
        {caption && <div className="mt-0.5 text-xs leading-4 text-text-muted">{caption}</div>}
      </div>
      {trailing}
      {(chevron ?? (!!href && !trailing)) && (
        <ChevronRight size={18} className="shrink-0 text-text-disabled" aria-hidden />
      )}
    </>
  );
  const classes = cn("flex items-center gap-3 px-3.5 py-3", className);
  return href ? (
    <Link href={href} className={cn(classes, "transition-colors hover:bg-surface")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** A label and value on one line, for a Details list. */
export function DetailRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-3.5 py-3", className)}>
      <div className="shrink-0 text-xs leading-5 text-text-muted">{label}</div>
      <div className="min-w-0 text-right text-sm font-semibold leading-5 text-text-primary">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty and notice states
// ---------------------------------------------------------------------------

/** The big tinted icon, title, sentence and action of an empty screen. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel tone="float" padding="lg" className={cn("text-center", className)}>
      <div className="mx-auto mb-5 flex size-24 items-center justify-center rounded-[28px] bg-blue-50 text-brand-blue">
        <Icon size={44} strokeWidth={1.5} aria-hidden />
      </div>
      <div className="font-display text-lg font-bold tracking-[-0.3px] text-text-primary">{title}</div>
      {body && <div className="mt-2 text-sm leading-[21px] text-text-secondary">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </Panel>
  );
}

/** A titled callout: tinted blue by default, amber to warn, red for danger. */
export function Notice({
  icon,
  tone = "tint",
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  tone?: "tint" | "warn" | "danger";
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tileTone: TileTone = tone === "warn" ? "warn" : tone === "danger" ? "danger" : "brand";
  return (
    <Panel tone={tone} className={className}>
      <div className="flex items-start gap-3">
        {icon && <Tile icon={icon} tone={tileTone} size="sm" className={tone === "tint" ? "bg-white" : undefined} />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-[21px] text-text-primary">{title}</div>
          {children && <div className="mt-1 text-[13px] leading-[19px] text-text-secondary">{children}</div>}
          {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </Panel>
  );
}
