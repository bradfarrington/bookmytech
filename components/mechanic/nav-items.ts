import {
  Calendar,
  CreditCard,
  FileText,
  Inbox,
  LifeBuoy,
  PoundSterling,
  Scale,
  SlidersHorizontal,
  Star,
  User,
  type LucideIcon,
} from "lucide-react";

export interface MechanicNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Counts to show beside nav items, keyed by href (e.g. open disputes). Absent/0 = no badge. */
export type MechanicNavBadges = Record<string, number | undefined>;

// Shared by the desktop sidebar and the mobile drawer so the two nav surfaces
// never drift. (No bottom-tab bar — the mobile experience is a responsive
// website, not an app shell.)
export const MECHANIC_NAV_ITEMS: readonly MechanicNavItem[] = [
  { label: "Jobs", href: "/mechanic/jobs", icon: Inbox },
  { label: "Schedule", href: "/mechanic/schedule", icon: Calendar },
  { label: "Earnings", href: "/mechanic/earnings", icon: PoundSterling },
  { label: "Reviews", href: "/mechanic/reviews", icon: Star },
  { label: "Availability", href: "/mechanic/availability", icon: SlidersHorizontal },
  { label: "Profile", href: "/mechanic/profile", icon: User },
  { label: "Documents", href: "/mechanic/documents", icon: FileText },
  // Customer-facing complaints on the mechanic's jobs (Task 25). Separate
  // from "Get help", which is the mechanic ↔ BMT Resolution Center.
  { label: "Disputes", href: "/mechanic/disputes", icon: Scale },
  { label: "Get help", href: "/mechanic/resolutions", icon: LifeBuoy },
  { label: "Get paid", href: "/mechanic/onboarding/stripe", icon: CreditCard },
];

// Sub-routes (e.g. /mechanic/jobs/[id]) keep their parent nav item active.
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
