import { Reveal } from "@/components/ui/reveal";
import { RegLookupForm } from "./reg-lookup-form";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-brand-gradient-deep text-white">
      <div aria-hidden className="final-glow pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto max-w-[720px] px-4 py-[72px] text-center sm:px-6 sm:py-[100px]">
        <Reveal>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
            Ready to book?
          </p>
          <h2 className="mb-4 mt-3 font-display text-[clamp(32px,5vw,54px)] font-extrabold leading-[1.05] tracking-[-0.025em]">
            It takes 60 seconds.
          </h2>
          <p className="mb-8 text-lg text-white/80">
            Drop in your reg, see your fixed price, pick a slot. We&apos;ll come to
            you.
          </p>
        </Reveal>
        <RegLookupForm variant="final" className="mx-auto max-w-[520px]" />
      </div>
    </section>
  );
}
