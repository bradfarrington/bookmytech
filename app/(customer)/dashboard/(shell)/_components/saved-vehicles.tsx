import Link from "next/link";
import { Car } from "lucide-react";
import { SectionHeading } from "./section-heading";

interface SavedVehicle {
  reg: string;
  make: string | null;
  model: string | null;
  postcode: string | null;
}

// Vehicles derived from the customer's own bookings (distinct registration).
// Each rebooks in a tap by pre-filling the booking flow. An editable saved-
// vehicles store (rename/remove) is deferred — see the Task 09 md.
export function SavedVehicles({ vehicles }: { vehicles: SavedVehicle[] }) {
  if (vehicles.length === 0) return null;

  return (
    <section>
      <SectionHeading>Your vehicles</SectionHeading>
      {/* One column, always. This renders in the dashboard's 320px sidebar on
          desktop, where a viewport-width `sm:grid-cols-2` produced two ~140px
          cards and truncated every make to "F…". */}
      <div className="flex flex-col gap-2.5">
        {vehicles.map((v) => {
          const desc = [v.make, v.model].filter(Boolean).join(" ");
          const href = `/book/vehicle?${new URLSearchParams({
            reg: v.reg,
            ...(v.postcode ? { postcode: v.postcode } : {}),
          }).toString()}`;
          return (
            <Link
              key={v.reg}
              href={href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface-card p-4 transition-colors hover:border-brand-blue"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                <Car size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-text-primary">{v.reg}</p>
                {desc && <p className="truncate text-sm text-text-muted">{desc}</p>}
              </div>
              <span className="ml-auto shrink-0 text-sm font-medium text-brand-blue">Book</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
