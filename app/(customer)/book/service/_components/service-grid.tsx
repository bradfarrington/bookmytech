"use client";

import { useState } from "react";
import {
  Search,
  Wrench,
  Cpu,
  CircleDot,
  Battery,
  Settings,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";
import { track, FUNNEL_EVENTS } from "@/lib/analytics/track";

interface Service {
  id: string;
  name: string;
  slug: string;
  starting_price_pence: number;
  description?: string | null;
}

interface ServiceGridProps {
  services: Service[];
  reg: string;
  make?: string;
  model?: string;
  postcode?: string;
}

const PRIMARY_SLUGS = [
  "full-service",
  "diagnostic",
  "brakes-tyres",
  "battery",
  "clutch-gears",
  "mot-pre-check",
];

const SLUG_ICONS: Record<string, React.ElementType> = {
  "full-service": Settings,
  diagnostic: Cpu,
  "brakes-tyres": CircleDot,
  battery: Battery,
  "clutch-gears": Settings,
  "mot-pre-check": ClipboardCheck,
};

const POPULAR_SLUG = "diagnostic";

export function ServiceGrid({ services, reg, make, model, postcode }: ServiceGridProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const vehicleParams = [
    make ? `make=${encodeURIComponent(make)}` : null,
    model ? `model=${encodeURIComponent(model)}` : null,
    postcode ? `postcode=${encodeURIComponent(postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  function serviceHref(slug: string) {
    const base = `/book/match?reg=${encodeURIComponent(reg)}&service=${encodeURIComponent(slug)}`;
    return vehicleParams ? `${base}&${vehicleParams}` : base;
  }

  function onSelect(slug: string) {
    track(FUNNEL_EVENTS.serviceSelected, { service: slug });
  }

  const filtered = query.trim()
    ? services.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()),
      )
    : services;

  const primary = filtered.filter((s) => PRIMARY_SLUGS.includes(s.slug));
  const secondary = filtered.filter((s) => !PRIMARY_SLUGS.includes(s.slug));

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <label className="flex h-12 items-center gap-2.5 rounded-lg border border-border bg-surface-card px-3 transition-colors focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/25">
        <Search size={16} className="shrink-0 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          className="h-full flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </label>

      {/* Primary grid */}
      {primary.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {primary.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              href={serviceHref(service.slug)}
              onSelect={() => onSelect(service.slug)}
              popular={service.slug === POPULAR_SLUG}
            />
          ))}
        </div>
      )}

      {/* "Not sure?" card */}
      {!query && (
        <a
          href={serviceHref("diagnostic")}
          onClick={() => onSelect("diagnostic")}
          className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-brand-blue/40 bg-blue-50/50 p-4 transition-colors hover:bg-blue-50"
        >
          <div>
            <p className="font-semibold text-brand-blue">Not sure what&apos;s wrong?</p>
            <p className="text-sm text-text-secondary">Book a diagnostic and we&apos;ll find out</p>
          </div>
          <Wrench size={20} className="shrink-0 text-brand-blue" />
        </a>
      )}

      {/* Secondary services */}
      {secondary.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full items-center justify-between py-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            <span>More services ({secondary.length})</span>
            {showAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showAll && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {secondary.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  href={serviceHref(service.slug)}
                  onSelect={() => onSelect(service.slug)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-text-muted">
          No services match &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  );
}

function ServiceCard({
  service,
  href,
  onSelect,
  popular = false,
}: {
  service: Service;
  href: string;
  onSelect?: () => void;
  popular?: boolean;
}) {
  const IconComp = SLUG_ICONS[service.slug] ?? Wrench;

  return (
    <a
      href={href}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-surface-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md",
        popular ? "border-brand-blue/30" : "border-border",
      )}
    >
      {popular && (
        <span className="absolute right-3 top-3">
          <Pill tone="active">Most popular</Pill>
        </span>
      )}
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          popular ? "bg-brand-blue text-white" : "bg-surface text-text-secondary group-hover:bg-blue-50 group-hover:text-brand-blue",
        )}
      >
        <IconComp size={20} />
      </div>
      <div>
        <p className="text-sm font-bold text-text-primary leading-tight">{service.name}</p>
        <p className="mt-1 text-[13px] text-text-muted">
          From {formatPrice(service.starting_price_pence)}
        </p>
      </div>
    </a>
  );
}
