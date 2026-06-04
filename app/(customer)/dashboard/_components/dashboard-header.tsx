import Link from "next/link";
import Image from "next/image";
import { Settings, LogOut } from "lucide-react";
import { signOut } from "@/app/actions/sign-out";

// Slim top bar for the customer dashboard: brand home link, account settings,
// and sign-out. A full profile dropdown is overkill for two destinations.
export function DashboardHeader({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  return (
    <header className="border-b border-border bg-surface-card">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label="Book My Tech — home">
          <Image src="/logo-no-bg.png" alt="Book My Tech" width={120} height={32} className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-2">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-blue/10 text-sm font-bold text-brand-blue">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <Link
            href="/dashboard/settings"
            className="inline-flex h-9 items-center gap-1.5 rounded-button px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Settings</span>
          </Link>
          <form action={signOut}>
            <input type="hidden" name="redirectTo" value="/login" />
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-button px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
