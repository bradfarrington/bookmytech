import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";

export interface OnlineMechanic {
  id: string;
  name: string;
  status: "online" | "on_job";
  area: string | null;
  rating: number | null;
}

// Who's available right now. `online` mechanics can take new offers; `on_job`
// are mid-job. Offline mechanics are omitted — this panel is about live supply.
export function MechanicsOnline({ mechanics }: { mechanics: OnlineMechanic[] }) {
  return (
    <Card padded={false}>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Icon icon={Users} size={16} className="text-brand-blue" />
        <h2 className="text-[15px] font-bold text-text-primary">Mechanics available</h2>
        <Pill tone={mechanics.length > 0 ? "success" : "neutral"} dot>
          {mechanics.length} live
        </Pill>
      </div>

      {mechanics.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">
          No mechanics online right now. New job offers won&apos;t reach anyone
          until someone goes online.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {mechanics.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={m.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-primary">{m.name}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  {m.area ? (
                    <span className="font-semibold uppercase tracking-[0.04em]">{m.area}</span>
                  ) : (
                    "Area not set"
                  )}
                  {m.rating != null && m.rating > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{m.rating.toFixed(1)}★</span>
                    </>
                  )}
                </p>
              </div>
              <Pill tone={m.status === "on_job" ? "active" : "success"}>
                {m.status === "on_job" ? "On a job" : "Online"}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
