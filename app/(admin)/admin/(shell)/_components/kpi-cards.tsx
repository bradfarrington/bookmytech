import { Activity, PoundSterling, Percent, Wrench, Timer } from "lucide-react";
import { KPI } from "@/components/ui/kpi";
import { formatPrice } from "@/lib/utils";

export interface OverviewKpis {
  liveBookings: number;
  gmvTodayPence: number;
  mechanicsOnline: number;
}

// Five top-of-page stats per the brief. Take-rate and time-to-accept are
// deliberate placeholders until the pricing engine / automated dispatch exist.
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
        value="15%"
        icon={Percent}
        delta="Fixed until pricing engine"
      />
      <KPI
        label="Mechanics online"
        value={kpis.mechanicsOnline}
        icon={Wrench}
      />
      <KPI
        label="Avg time-to-accept"
        value="—"
        icon={Timer}
        delta="Available once dispatch is automated"
      />
    </div>
  );
}
