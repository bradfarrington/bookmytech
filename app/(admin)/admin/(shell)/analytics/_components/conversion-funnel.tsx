import { Filter } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface FunnelStep {
  /** Human label, e.g. "Reg lookup started". */
  label: string;
  /** Distinct sessions that reached this step. */
  sessions: number;
}

// Five-stage booking conversion funnel. Bar width is each step's share of the
// top-of-funnel; the right column shows step-to-step conversion so drop-off is
// obvious. Counts come from the analytics_funnel RPC (distinct sessions).
export function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.sessions ?? 0;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Filter size={16} className="text-brand-blue" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          Booking conversion funnel
        </h2>
      </div>

      {top > 0 ? (
        <ol className="space-y-2.5">
          {steps.map((step, i) => {
            const prev = i === 0 ? step.sessions : steps[i - 1].sessions;
            const fromTop = top > 0 ? (step.sessions / top) * 100 : 0;
            const stepConv =
              i === 0 ? 100 : prev > 0 ? (step.sessions / prev) * 100 : 0;
            return (
              <li key={step.label} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-text-primary">
                    {i + 1}. {step.label}
                  </span>
                  <span className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-bold text-text-primary">
                      {step.sessions.toLocaleString("en-GB")}
                    </span>
                    {i > 0 && (
                      <span
                        className={
                          stepConv >= 60
                            ? "text-xs font-semibold text-green-700"
                            : stepConv >= 30
                              ? "text-xs font-semibold text-amber-600"
                              : "text-xs font-semibold text-red-600"
                        }
                      >
                        {Math.round(stepConv)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-7 overflow-hidden rounded-lg bg-surface">
                  <div
                    className="flex h-full items-center rounded-lg bg-brand-blue/90 px-2.5 transition-all"
                    style={{ width: `${Math.max(3, fromTop)}%` }}
                  >
                    <span className="text-[11px] font-semibold text-white tabular-nums">
                      {Math.round(fromTop)}%
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-8 text-center text-sm text-text-muted">
          No funnel activity in this period yet. Events start flowing once
          visitors move through the booking flow.
        </p>
      )}

      <p className="text-xs text-text-muted">
        Bars show each step&apos;s share of all sessions that started a reg
        lookup; the percentage on the right is step-to-step conversion.
      </p>
    </Card>
  );
}
