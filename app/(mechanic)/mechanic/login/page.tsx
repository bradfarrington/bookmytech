import type { Metadata } from "next";
import Image from "next/image";
import { MechanicLoginForm } from "./_components/login-form";

export const metadata: Metadata = {
  title: "Sign in — Book My Tech for mechanics",
};

export default function MechanicLoginPage() {
  return (
    <main className="flex min-h-dvh w-full flex-col md:flex-row">
      {/* Brand panel — watermark favicon anchored top, tagline copy bottom */}
      <section className="relative flex flex-col justify-end overflow-hidden bg-brand-gradient p-8 text-white md:min-h-dvh md:w-1/2 md:p-12">
        <Image
          src="/favicon.png"
          alt=""
          aria-hidden
          width={900}
          height={900}
          className="pointer-events-none absolute -right-32 -top-32 hidden w-[80%] max-w-[700px] select-none opacity-[0.06] brightness-0 invert md:block"
        />

        {/* Mobile-only: small centred favicon so the short banner isn't empty */}
        <div className="relative z-10 flex items-center justify-center md:hidden">
          <Image
            src="/favicon.png"
            alt="Book My Tech"
            width={64}
            height={64}
            priority
            className="h-12 w-12 brightness-0 invert"
          />
        </div>

        <div className="relative z-10 hidden max-w-md md:block">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">
            Mechanic dashboard
          </p>
          <p className="text-3xl font-bold tracking-tight lg:text-4xl">
            Your jobs, your schedule, your earnings — all in one place.
          </p>
          <p className="mt-4 leading-relaxed text-white/75">
            Sign in to see live job offers in your area, manage your day, and
            track what you&apos;ve earned.
          </p>
        </div>
      </section>

      {/* Form panel — wordmark above the heading */}
      <section className="flex flex-1 items-center justify-center bg-surface-card p-6 md:p-12">
        <div className="w-full max-w-sm">
          <h1 className="sr-only">Sign in to your mechanic dashboard</h1>
          <Image
            src="/logo.png"
            alt="Book My Tech"
            width={520}
            height={156}
            priority
            className="mx-auto mb-12 h-32 w-auto"
          />
          <MechanicLoginForm />
        </div>
      </section>
    </main>
  );
}
