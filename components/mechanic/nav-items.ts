import {
  Calendar,
  CreditCard,
  FileText,
  Inbox,
  PoundSterling,
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
  { label: "Get paid", href: "/mechanic/onboarding/stripe", icon: CreditCard },
];

// Sub-routes (e.g. /mechanic/jobs/[id]) keep their parent nav item active.
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
