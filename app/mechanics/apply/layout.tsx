import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { ApplicationProvider } from "./_components/application-provider";
import { ApplyProgress } from "./_components/apply-progress";
import { AreaCapture } from "./_components/area-capture";

export const metadata: Metadata = {
  title: "Become a Book My Tech mechanic",
  description:
    "Apply to join Book My Tech as a vetted mobile mechanic. Set your own area, get matched to jobs near you.",
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-3">
          <Link href="/" aria-label="Book My Tech — home">
            <Image src="/logo-no-bg.png" alt="Book My Tech" width={120} height={32} className="h-8 w-auto" />
          </Link>
          <a
            href="tel:+441234567890"
            className="text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Questions? Call us
          </a>
        </div>
      </header>

      <ApplicationProvider>
        <Suspense fallback={null}>
          <AreaCapture />
        </Suspense>
        <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
          <ApplyProgress />
          {children}
        </main>
      </ApplicationProvider>
    </div>
  );
}
