import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { formatPrice } from "@/lib/utils";
import { resolveArea, type AreaRow } from "@/lib/pricing/calculate";
import { DemandHeatmap, type HeatCell } from "@/components/admin/demand-heatmap";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set(["sourcing_mechanic", "confirmed", "en_route", "in_progress"]);

function district(postcode: string | null): string | null {
  if (!postcode || !postcode.trim()) return null;
  return postcode.trim().toUpperCase().split(/\s+/)[0];
}

const STATUS_TONE: Record<string, "success" | "pending" | "neutral"> = {
  active: "success",
  planned: "pending",
  paused: "neutral",
};

interface AreaFull extends AreaRow {
  status: string;
  slug: string | null;
  target_mechanic_count: number | null;
}

export default async function AdminAreasPage() {
  const supabase = await createClient();

  const [{ data: areasRaw }, { data: bookingsRaw }, { data: mechanicsRaw }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name, slug, postcode_prefixes, labour_multiplier, status, target_mechanic_count")
      .order("status", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("bookings").select("area_id, area, total_pence, status").limit(5000),
    supabase.from("mechanics").select("base_postcode, status"),
  ]);

  const areas = (areasRaw ?? []) as AreaFull[];
  const bookings = bookingsRaw ?? [];
  const mechanics = mechanicsRaw ?? [];

  // Resolve every mechanic's base postcode to an area for the supply count.
  const mechByArea = new Map<string, number>();
  const onlineByDistrict = new Map<string, number>();
  for (const m of mechanics) {
    const area = resolveArea(m.base_postcode ?? "", areas as AreaRow[]);
    if (area) mechByArea.set(area.id, (mechByArea.get(area.id) ?? 0) + 1);
    if (m.status === "online") {
      const d = district(m.base_postcode);
      if (d) onlineByDistrict.set(d, (onlineByDistrict.get(d) ?? 0) + 1);
    }
  }

  // Per-area booking + GMV + active-demand tallies (keyed by snapshot area_id).
  const bookingsByArea = new Map<string, number>();
  const gmvByArea = new Map<string, number>();
  const activeByArea = new Map<string, number>();
  const bookingsByDistrict = new Map<string, number>();
  for (const b of bookings) {
    if (b.area_id) {
      bookingsByArea.set(b.area_id, (bookingsByArea.get(b.area_id) ?? 0) + 1);
      if (b.status !== "cancelled") {
        gmvByArea.set(b.area_id, (gmvByArea.get(b.area_id) ?? 0) + (b.total_pence ?? 0));
      }
      if (ACTIVE_STATUSES.has(b.status)) {
        activeByArea.set(b.area_id, (activeByArea.get(b.area_id) ?? 0) + 1);
      }
    }
    if (b.area) bookingsByDistrict.set(b.area, (bookingsByDistrict.get(b.area) ?? 0) + 1);
  }

  const heatCells: HeatCell[] = [...bookingsByDistrict.entries()].map(([d, count]) => ({
    district: d,
    bookings: count,
    mechanics: onlineByDistrict.get(d) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Areas &amp; demand
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            Operational areas across the network — demand, supply and GMV per
            city. Launch a new city with the setup wizard.
          </p>
        </div>
        <Link href="/admin/areas/setup">
          <Button variant="primary" iconLeft={Plus}>
            Launch a city
          </Button>
        </Link>
      </header>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5">Area</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Mechanics</th>
                <th className="px-4 py-2.5 text-right">Bookings</th>
                <th className="px-4 py-2.5 text-right">Active demand</th>
                <th className="px-4 py-2.5 text-right">GMV</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => {
                const mechCount = mechByArea.get(a.id) ?? 0;
                const target = a.target_mechanic_count;
                return (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/areas/${a.id}`} className="font-semibold text-text-primary hover:text-brand-blue">
                        {a.name}
                      </Link>
                      <div className="text-xs text-text-muted">
                        ×{Number(a.labour_multiplier).toFixed(3)} ·{" "}
                        {(a.postcode_prefixes ?? []).length
                          ? (a.postcode_prefixes ?? []).slice(0, 4).join(", ") +
                            ((a.postcode_prefixes ?? []).length > 4 ? "…" : "")
                          : "catch-all"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</Pill>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {mechCount}
                      {target ? <span className="text-text-muted"> / {target}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {bookingsByArea.get(a.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={(activeByArea.get(a.id) ?? 0) > mechCount * 2 ? "font-semibold text-amber-600" : "text-text-secondary"}>
                        {activeByArea.get(a.id) ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-text-primary">
                      {formatPrice(gmvByArea.get(a.id) ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/areas/${a.id}`}
                        className="inline-flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary"
                        aria-label={`Open ${a.name}`}
                      >
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {areas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                    No areas yet. Launch your first city.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <DemandHeatmap cells={heatCells} />
    </div>
  );
}
