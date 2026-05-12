import { Check } from "lucide-react";
import { CustomerNav } from "@/components/ui/customer-nav";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { MechanicPreviewCard } from "./mechanic-preview-card";
import { RegLookupForm } from "./reg-lookup-form";

const REASSURANCES = [
  "No upfront payment",
  "Vetted mechanics only",
  "12-month workmanship guarantee",
] as const;

export function Hero() {
  return (
    <section className="bg-brand-gradient text-white">
      <CustomerNav active="Book" dark />

      <div className="mx-auto grid max-w-content gap-10 px-4 pb-14 pt-8 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-14 lg:pt-14">
        <div>
          <Pill
            tone="dark"
            dot
            className="mb-[18px] bg-white/15 text-white [&>span:first-child]:bg-success"
          >
            1,200+ mechanics live across the UK
          </Pill>

          <h1 className="mb-[18px] text-[40px] font-extrabold leading-[1.05] tracking-[-0.025em] text-white sm:text-5xl lg:text-[56px]">
            Your car, fixed at your door — booked in 60 seconds.
          </h1>

          <p className="mb-7 max-w-[540px] text-base leading-[1.55] text-white/85 sm:text-lg">
            Vetted mobile mechanics. Transparent pricing. Pay only when the job is
            done. No more garages. No more hidden fees. Just one tap, and we&apos;ll
            come to you.
          </p>

          <RegLookupForm
            defaultReg="LB21 XYZ"
            defaultPostcode="SE15 4QF"
            className="max-w-[540px]"
          />

          <ul className="mt-[22px] flex flex-wrap gap-x-[18px] gap-y-2 text-xs text-white/75">
            {REASSURANCES.map((label) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon icon={Check} size={13} className="text-success" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative lg:ml-auto">
          <MechanicPreviewCard />
        </div>
      </div>
    </section>
  );
}
