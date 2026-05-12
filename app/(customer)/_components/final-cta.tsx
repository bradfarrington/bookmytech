import { RegLookupForm } from "./reg-lookup-form";

export function FinalCta() {
  return (
    <section className="bg-brand-gradient text-white">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-8 lg:py-[72px]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-3 text-[32px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[40px]">
            Ready to book? It takes 60 seconds.
          </h2>
          <p className="mb-7 text-base text-white/85 sm:text-lg">
            Drop in your reg, see your fixed price, pick a slot. We&apos;ll come to
            you.
          </p>
        </div>
        <RegLookupForm className="mx-auto max-w-[540px]" />
      </div>
    </section>
  );
}
