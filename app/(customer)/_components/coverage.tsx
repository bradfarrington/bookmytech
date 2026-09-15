import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";
import { GetPriceButton } from "./get-price-button";
import { UK_CITY_PINS, UK_MAP_SIZE, UK_OUTLINE_PATH, type UkCity } from "./uk-outline";

// Where we're live. Kept in step with the FAQ's areas answer, with deliberately
// no mechanic counts. All four are live (Brad, 2026-09-15).
// `label` says which side of the pin the name sits on, so neighbouring pins
// (Bristol and London share a latitude) don't collide.
const AREAS: { name: UkCity; label: "left" | "right" }[] = [
  { name: "Greater London", label: "right" },
  { name: "Birmingham", label: "right" },
  { name: "Manchester", label: "left" },
  { name: "Bristol", label: "left" },
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
            title="Live in London, Birmingham, Manchester and Bristol."
            lead="Add your postcode when you look up your car, and your job goes to vetted mechanics who cover your area."
          />

          <Reveal as="ul" stagger className="mt-7 grid grid-cols-2 gap-2.5">
            {AREAS.map((area) => (
              <li
                key={area.name}
                className="flex flex-col items-start gap-1 rounded-xl border border-border bg-white px-4 py-3.5 min-[901px]:flex-row min-[901px]:items-center min-[901px]:justify-between min-[901px]:gap-2"
              >
                <span className="text-sm font-bold text-text-primary">{area.name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />
                  Live
                </span>
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
          {/* aspect ratio matches the outline's box exactly, so pins can be
              placed as percentages of it. */}
          <div
            aria-hidden
            className="relative mx-auto aspect-[4/5] w-full max-w-[460px] overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_60%_75%,#eff6ff_0%,#ffffff_70%)] shadow-card"
          >
            <svg
              viewBox={`0 0 ${UK_MAP_SIZE.width} ${UK_MAP_SIZE.height}`}
              className="absolute inset-0 size-full"
            >
              <path
                d={UK_OUTLINE_PATH}
                className="fill-indigo-50 stroke-blue-200"
                strokeWidth={1.2}
                strokeLinejoin="round"
              />
            </svg>

            {AREAS.map((area) => {
              const pin = UK_CITY_PINS[area.name];
              return (
                <div
                  key={area.name}
                  className={cn(
                    "absolute flex -translate-y-1/2 items-center gap-2",
                    area.label === "right" ? "-translate-x-1.5" : "-translate-x-[calc(100%-6px)] flex-row-reverse",
                  )}
                  style={{
                    left: `${(pin.x / UK_MAP_SIZE.width) * 100}%`,
                    top: `${(pin.y / UK_MAP_SIZE.height) * 100}%`,
                  }}
                >
                  <span className="size-3 shrink-0 animate-live-pulse rounded-full bg-success shadow-[0_0_0_6px_rgba(34,197,94,0.2)] motion-reduce:animate-none" />
                  {/* Names hidden on phones: at that size London's label runs off
                      the card and Bristol's meets London's pin. The tiles
                      above already name every city. */}
                  <span className="hidden whitespace-nowrap rounded-full bg-white px-2 py-[3px] text-xs font-bold text-text-primary shadow-card min-[561px]:inline">
                    {area.name}
                  </span>
                </div>
              );
            })}

            <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-green-700 shadow-card">
              <span className="size-1.5 rounded-full bg-success" />
              Live in all four cities
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
