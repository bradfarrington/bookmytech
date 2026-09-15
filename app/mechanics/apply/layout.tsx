import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { LifeBuoy } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { ApplicationProvider } from "./_components/application-provider";
import { ApplyProgress } from "./_components/apply-progress";
import { AreaCapture } from "./_components/area-capture";

export const metadata: Metadata = {
  title: "Become a Book My Tech mechanic",
  description:
    "Apply to join Book My Tech as a vetted mobile mechanic. Set your own area, get matched to jobs near you.",
};

// Task 46: the application wears the site's look without the full nav, so an
// applicant isn't tempted away mid-form. A frosted header like the site nav, a
// gradient band holding the progress, and each step as one white card pulled up
// over the band. The help link opens in a new tab so a half-filled form isn't
// lost.
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-border bg-white/85 backdrop-blur-[14px] backdrop-saturate-[1.4]">
        <div className="mx-auto flex h-[68px] max-w-content items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Book My Tech home" className="flex items-center">
            <Image src="/logo-cropped.png" alt="Book My Tech" width={159} height={40} priority className="h-9 w-auto sm:h-10" />
          </Link>
          <Link
            href="/help"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            <Icon icon={LifeBuoy} size={16} strokeWidth={2} />
            Questions? Get help
          </Link>
        </div>
      </header>

      <ApplicationProvider>
        <Suspense fallback={null}>
          <AreaCapture />
        </Suspense>

        <div className="relative overflow-hidden bg-brand-gradient-deep text-white">
          <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-2xl px-4 pb-28 pt-10 sm:px-6 sm:pt-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
              Mechanic application
            </p>
            <p className="mt-2 text-sm text-white/70">Free to apply · takes about 10 minutes</p>
            <ApplyProgress />
          </div>
        </div>

        <main className="relative z-10 mx-auto -mt-20 max-w-2xl px-4 pb-16 sm:px-6">{children}</main>
      </ApplicationProvider>
    </div>
  );
}
