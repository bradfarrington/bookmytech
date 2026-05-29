import { AlertTriangle, MapPin, Star, Scale, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface UndersuppliedArea {
  area: string;
  activeBookings: number;
  onlineMechanics: number;
}

export interface PerfFlag {
  name: string;
  rating: number;
}

export interface NeedsAttentionData {
  undersuppliedAreas: UndersuppliedArea[];
  perfFlags: PerfFlag[];
  openDisputes: number;
}

export function NeedsAttention({ data }: { data: NeedsAttentionData }) {
  const { undersuppliedAreas, perfFlags, openDisputes } = data;
  const allClear =
    undersuppliedAreas.length === 0 && perfFlags.length === 0 && openDisputes === 0;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-500" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          Needs your attention
        </h2>
      </div>

      {allClear ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-green-50 px-3.5 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          <p className="text-sm text-green-800">
            All clear — no undersupplied areas, performance flags, or open
            disputes right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Section
            icon={MapPin}
            title="Undersupplied areas"
            empty={undersuppliedAreas.length === 0}
            emptyText="Supply looks healthy."
          >
            {undersuppliedAreas.map((a) => (
              <li key={a.area} className="flex items-center justify-between gap-3">
                <span className="font-bold uppercase tracking-[0.04em] text-text-secondary">
                  {a.area}
                </span>
                <span className="text-xs text-text-muted">
                  {a.activeBookings} active ·{" "}
                  <span className="font-semibold text-amber-600">
                    {a.onlineMechanics} online
                  </span>
                </span>
              </li>
            ))}
          </Section>

          <Section
            icon={Star}
            title="Performance flags"
            empty={perfFlags.length === 0}
            emptyText="No mechanics below 4.0★."
          >
            {perfFlags.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">{m.name}</span>
                <span className="text-xs font-semibold text-amber-600">
                  {m.rating.toFixed(2)}★
                </span>
              </li>
            ))}
          </Section>

          <Section
            icon={Scale}
            title="Open disputes"
            empty={openDisputes === 0}
            emptyText="No open disputes."
          >
            <li className="text-text-secondary">
              <span className="font-semibold text-red-600">{openDisputes}</span>{" "}
              awaiting review
            </li>
          </Section>
        </div>
      )}
    </Card>
  );
}

function Section({
  icon: Icon,
  title,
  empty,
  emptyText,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        <Icon size={12} />
        {title}
      </div>
      {empty ? (
        <p className="text-sm text-text-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">{children}</ul>
      )}
    </div>
  );
}
