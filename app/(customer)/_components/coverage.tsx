import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";
import { GetPriceButton } from "./get-price-button";

// Where we're live. Kept in step with the FAQ's areas answer — there are
// deliberately no mechanic counts. The pin positions are decorative, placed
// roughly by geography on the stylised map.
// ⚠️ Confirm the live / coming-soon areas with Brad before this ships.
const AREAS: {
  name: string;
  live: boolean;
  pin: { top: string; left: string };
}[] = [
  { name: "Greater London", live: true, pin: { top: "64%", left: "60%" } },
  { name: "Birmingham", live: false, pin: { top: "51%", left: "45%" } },
  { name: "Manchester", live: false, pin: { top: "37%", left: "42%" } },
  { name: "Bristol", live: false, pin: { top: "66%", left: "32%" } },
];

export function Coverage() {
  return (
    <section id="coverage" className="scroll-mt-[68px]">
      <div className="mx-auto grid max-w-content items-center gap-8 px-4 py-14 sm:px-6 sm:py-[88px] min-[901px]:grid-cols-2 min-[901px]:gap-14">
        <div>
          <SectionHeading
            align="left"
            className="mb-0"
            eyebrow="Coverage"
            title="Live in Greater London. Expanding across the UK."
            lead="Add your postcode when you look up your car, and your job goes to vetted mechanics who cover your area."
          />

          <Reveal as="ul" stagger className="mt-7 grid grid-cols-2 gap-2.5">
            {AREAS.map((area) => (
              <li
                key={area.name}
                className="flex flex-col items-start gap-1 rounded-xl border border-border bg-white px-4 py-3.5 min-[901px]:flex-row min-[901px]:items-center min-[901px]:justify-between min-[901px]:gap-2"
              >
                <span className="text-sm font-bold text-text-primary">{area.name}</span>
                {area.live ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
                    <span aria-hidden className="size-1.5 rounded-full bg-success" />
                    Live
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-text-muted">Coming soon</span>
                )}
              </li>
            ))}
          </Reveal>

          <p className="mt-5 text-[13px] text-text-muted">
            Somewhere else? Mechanics are joining across the UK, so check your postcode.
          </p>
          <GetPriceButton variant="primary" className="mt-5 font-bold">
            Check your postcode
          </GetPriceButton>
        </div>

        <Reveal>
          <div
            aria-hidden
            className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-3xl border border-border bg-white shadow-card"
          >
            <div className="coverage-blobs absolute inset-[30px]" />
            {AREAS.map((area) => (
              <div
                key={area.name}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2"
                style={area.pin}
              >
                <span
                  className={cn(
                    "size-3 shrink-0 rounded-full",
                    area.live
                      ? "animate-live-pulse bg-success shadow-[0_0_0_6px_rgba(34,197,94,0.2)] motion-reduce:animate-none"
                      : "bg-brand-blue shadow-[0_0_0_6px_rgba(37,99,235,0.18)]",
                  )}
                />
                <span className="whitespace-nowrap rounded-full bg-white px-2 py-[3px] text-xs font-bold text-text-primary shadow-card">
                  {area.name} · {area.live ? "Live" : "Soon"}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
