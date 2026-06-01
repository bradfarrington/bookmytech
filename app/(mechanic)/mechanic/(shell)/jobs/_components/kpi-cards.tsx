import { Folder, PoundSterling, Star, Zap } from "lucide-react";
import { KPI } from "@/components/ui/kpi";
import { formatPrice } from "@/lib/utils";

export interface MechanicKpis {
  todayEarningsPence: number;
  jobsThisWeek: number;
  /** null when the mechanic has no accept/decline decisions in the window. */
  acceptanceRate: number | null;
  /** null until reviews exist (Task 11). */
  rating: number | null;
}

export function KpiCards({ kpis }: { kpis: MechanicKpis }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KPI
        label="Today's earnings"
        value={formatPrice(kpis.todayEarningsPence)}
        delta="Your share, after fees"
        icon={PoundSterling}
      />
      <KPI
        label="Jobs this week"
        value={kpis.jobsThisWeek}
        delta="Completed since Monday"
        icon={Folder}
      />
      <KPI
        label="Acceptance rate"
        value={kpis.acceptanceRate === null ? "—" : `${kpis.acceptanceRate}%`}
        delta="Last 30 days"
        icon={Zap}
      />
      <KPI
        label="Customer rating"
        value={kpis.rating === null ? "—" : `${kpis.rating.toFixed(1)} ★`}
        delta="From completed jobs"
        icon={Star}
      />
    </div>
  );
}
