import { Activity, PoundSterling, Percent, Wrench, Timer } from "lucide-react";
import { KPI } from "@/components/ui/kpi";
import { formatPrice } from "@/lib/utils";

export interface OverviewKpis {
  liveBookings: number;
  gmvTodayPence: number;
  mechanicsOnline: number;
  /** Platform fee as a % of GMV; null when there are no priced bookings yet. */
  takeRatePct: number | null;
  /** Mean offer→accept time in seconds; null when no offers accepted yet. */
  avgAcceptSecs: number | null;
}

// Human duration: "45s", "2m 30s", "1h 5m".
function fmtDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Five top-of-page stats per the brief, all live: take-rate is the real platform
// fee share of GMV, time-to-accept the mean offer→accept across the dispatch feed.
export function KpiCards({ kpis }: { kpis: OverviewKpis }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <KPI
        label="Live bookings"
        value={kpis.liveBookings}
        icon={Activity}
        delta="Confirmed · en route · in progress"
      />
      <KPI
        label="GMV today"
        value={formatPrice(kpis.gmvTodayPence)}
        icon={PoundSterling}
        delta="Gross merchandise value"
      />
      <KPI
        label="Take-rate"
        value={kpis.takeRatePct != null ? `${+kpis.takeRatePct.toFixed(1)}%` : "—"}
        icon={Percent}
        delta={kpis.takeRatePct != null ? "Platform fee share of GMV" : "No bookings yet"}
      />
      <KPI
        label="Mechanics online"
        value={kpis.mechanicsOnline}
        icon={Wrench}
      />
      <KPI
        label="Avg time-to-accept"
        value={kpis.avgAcceptSecs != null ? fmtDuration(kpis.avgAcceptSecs) : "—"}
        icon={Timer}
        delta={kpis.avgAcceptSecs != null ? "Offer → accepted" : "No accepts yet"}
      />
    </div>
  );
}
