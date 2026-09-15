import { Check } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { GET_PRICE_INPUT_ID } from "./get-price";
import { LiveDispatchCard } from "./live-dispatch-card";
import { RegLookupForm } from "./reg-lookup-form";

const REASSURANCES = [
  "No upfront payment",
  "DBS-checked, fully insured",
  "12-month workmanship guarantee",
] as const;

// Task 46: the redesign's hero layout, with our live dispatch animation in the
// right column instead of the proposal's static phone. The nav is rendered by
// the page above this section (see CustomerNav).
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-gradient-deep text-white">
      <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-content items-center gap-12 px-4 pb-[72px] pt-14 sm:px-6 sm:pb-24 sm:pt-[88px] min-[1000px]:grid-cols-[1.15fr_1fr] min-[1000px]:gap-[72px]">
        <Reveal stagger trigger="mount" y={18}>
          <span className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-[7px] pl-2.5 pr-3 text-xs font-semibold">
            <span
              aria-hidden
              className="size-2 rounded-full bg-success shadow-[0_0_0_4px_rgba(34,197,94,0.24)]"
            />
            1,200+ mechanics live across the UK
          </span>

          <h1 className="mb-[22px] font-display text-[clamp(38px,6vw,72px)] font-extrabold leading-[1.02] tracking-[-0.028em]">
            Your car,
            <br />
            fixed at your{" "}
            <em className="bg-[linear-gradient(90deg,#fff_0%,#fff_55%,#93c5fd_100%)] bg-clip-text not-italic text-transparent">
              door.
            </em>
          </h1>

          <p className="mb-7 max-w-[540px] text-[17px] leading-[1.55] text-white/80">
            Vetted mobile mechanics. Manufacturer-book pricing. Pay only when the
            job&apos;s done. Skip the garage, the phone calls, and the &ldquo;we&apos;ll
            take a look, £69 please.&rdquo; Just tap your reg.
          </p>

          <RegLookupForm variant="hero" inputId={GET_PRICE_INPUT_ID} className="max-w-[560px]" />

          <ul className="mt-[22px] flex flex-wrap gap-x-[22px] gap-y-2 text-[13px] font-medium text-white/85">
            {REASSURANCES.map((label) => (
              <li key={label} className="inline-flex items-center gap-2">
                <Icon icon={Check} size={14} strokeWidth={3} className="text-success" />
                {label}
              </li>
            ))}
          </ul>
        </Reveal>

        <div className="relative mx-auto w-full max-w-[420px] min-[1000px]:ml-auto min-[1000px]:mr-0">
          <LiveDispatchCard />
        </div>
      </div>
    </section>
  );
}
