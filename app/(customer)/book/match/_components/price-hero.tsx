import { ShieldCheck, Star, Wrench } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface PriceHeroProps {
  serviceName: string;
  pricePence: number;
  description?: string | null;
}

export function PriceHero({ serviceName, pricePence, description }: PriceHeroProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Price hero card */}
      <div className="rounded-2xl bg-brand-gradient p-6 text-white shadow-hero">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-200">
          Fixed price
        </p>
        <p className="mt-1 text-5xl font-extrabold tracking-tight">
          {formatPrice(pricePence)}
        </p>
        <p className="mt-2 text-lg font-semibold text-blue-100">{serviceName}</p>

        {description && (
          <p className="mt-2 text-sm text-blue-200 leading-relaxed">{description}</p>
        )}

        <ul className="mt-4 flex flex-col gap-1.5 text-sm text-blue-100">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-300" />
            Parts &amp; labour included
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-300" />
            No call-out fee
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-blue-300" />
            12-month guarantee
          </li>
        </ul>

        <p className="mt-4 rounded-xl bg-white/15 px-4 py-3 text-[13px] leading-relaxed text-blue-100">
          Your card is pre-authorised now. No money leaves your account until the job
          is complete and you&apos;ve signed off.
        </p>
      </div>

      {/* Trust row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: ShieldCheck, label: "Vetted professional" },
          { icon: Star, label: "12-month guarantee" },
          { icon: Wrench, label: "No fix, no fee" },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface-card px-2 py-3 text-center"
          >
            <Icon size={18} className="text-brand-blue" />
            <span className="text-[11px] font-semibold leading-tight text-text-secondary">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* How it works after booking */}
      <div className="rounded-xl border border-border-subtle bg-surface p-4 text-sm text-text-secondary leading-relaxed">
        <p className="font-semibold text-text-primary">What happens next?</p>
        <p className="mt-1">
          Once confirmed, we&apos;ll match you with the best available mechanic in
          your area. You&apos;ll receive a confirmation email as soon as one accepts —
          usually within minutes.
        </p>
      </div>
    </div>
  );
}
