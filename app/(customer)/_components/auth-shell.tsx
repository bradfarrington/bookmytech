import Link from "next/link";
import Image from "next/image";

// Centred-card auth shell for the public customer login + signup pages. Lighter
// than the admin 50/50 split — customers land here mid-booking, so it stays
// focused: logo, heading, the form, and a route home.
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center" aria-label="Book My Tech — home">
          <Image src="/logo-no-bg.png" alt="Book My Tech" width={200} height={56} priority className="h-12 w-auto" />
        </Link>

        <div className="rounded-2xl border border-border bg-surface-card p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-text-primary">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-text-muted">
          <Link href="/" className="font-medium text-text-secondary hover:text-text-primary">
            ← Back to Book My Tech
          </Link>
        </p>
      </div>
    </main>
  );
}
