import { MapPinned } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface HeatCell {
  /** Postcode district / outward code, e.g. "SW1", "M1". */
  district: string;
  bookings: number;
  /** Online mechanics covering the district (for the supply tint). */
  mechanics: number;
}

// Postcode-district demand heatmap. A geographic Google-Maps overlay needs a
// keyed Maps Platform load; until that lands this is a self-contained heat grid
// keyed by the booking `area` (outward postcode) column — tiles scale colour by
// demand, with an amber ring where demand outstrips supply. Same data the live
// monitor uses, aggregated per district.
export function DemandHeatmap({ cells }: { cells: HeatCell[] }) {
  const max = cells.reduce((m, c) => Math.max(m, c.bookings), 0) || 1;
  const sorted = [...cells].sort((a, b) => b.bookings - a.bookings);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <MapPinned size={16} className="text-brand-blue" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          Demand heatmap
        </h2>
        <span className="text-xs text-text-muted">by postcode district</span>
      </div>

      {sorted.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {sorted.map((c) => {
              // Intensity 0.12–1 so even low-demand tiles read as brand-blue.
              const intensity = 0.12 + 0.88 * (c.bookings / max);
              const undersupplied = c.bookings > 0 && c.mechanics < 2;
              return (
                <div
                  key={c.district}
                  className="relative flex aspect-square flex-col items-center justify-center rounded-lg p-1 text-center"
                  style={{ backgroundColor: `rgba(37, 99, 235, ${intensity.toFixed(3)})` }}
                  title={`${c.district}: ${c.bookings} booking${c.bookings === 1 ? "" : "s"}, ${c.mechanics} mechanic${c.mechanics === 1 ? "" : "s"}`}
                >
                  {undersupplied && (
                    <span className="absolute inset-0 rounded-lg ring-2 ring-inset ring-amber-400" />
                  )}
                  <span
                    className={
                      intensity > 0.5
                        ? "text-sm font-bold text-white"
                        : "text-sm font-bold text-text-primary"
                    }
                  >
                    {c.district}
                  </span>
                  <span
                    className={
                      intensity > 0.5
                        ? "text-[11px] font-semibold text-blue-100"
                        : "text-[11px] font-semibold text-text-secondary"
                    }
                  >
                    {c.bookings}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-brand-blue" /> Higher demand
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded ring-2 ring-inset ring-amber-400" /> Undersupplied (&lt;2 mechanics)
            </span>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-text-muted">
          No bookings to map yet.
        </p>
      )}
    </Card>
  );
}
