import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, ChevronRight, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { mechanicSharePence } from "@/lib/earnings";
import { formatPrice } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Pill, type PillProps } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";

export const dynamic = "force-dynamic";

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type JobStatus =
  | "confirmed"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";

const ACTIVE_STATUSES: JobStatus[] = ["confirmed", "en_route", "in_progress"];

const STATUS_META: Record<JobStatus, { label: string; tone: PillProps["tone"] }> = {
  confirmed: { label: "Confirmed", tone: "active" },
  en_route: { label: "On the way", tone: "active" },
  in_progress: { label: "In progress", tone: "pending" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  disputed: { label: "Disputed", tone: "error" },
};

interface BookingRow {
  id: string;
  scheduled_at: string | null;
  status: string;
  postcode: string | null;
  area: string | null;
  total_pence: number | null;
  commission_rate: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  service: unknown;
}

interface JobItem {
  id: string;
  status: JobStatus;
  whenLabel: string;
  sortKey: number;
  title: string;
  where: string;
  earnings: string;
}

function serviceName(service: unknown): string {
  const s = one(service as never) as { name?: string | null } | null;
  return s?.name ?? "Service";
}

function whenLabel(iso: string | null): string {
  if (!iso) return "Time to be confirmed";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function JobRow({ job }: { job: JobItem }) {
  const meta = STATUS_META[job.status];
  return (
    <Link
      href={`/mechanic/jobs/${job.id}`}
      className="flex items-center gap-3.5 border-b border-border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-surface"
    >
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 flex items-center gap-2">
          <span className="truncate text-sm font-bold text-text-primary">
            {job.title}
          </span>
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
          <span>{job.whenLabel}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Icon icon={MapPin} size={11} className="text-text-muted" />
            {job.where}
          </span>
        </span>
      </span>
      {job.earnings && (
        <span className="shrink-0 text-right text-sm font-bold text-text-primary">
          {job.earnings}
        </span>
      )}
      <Icon icon={ChevronRight} size={16} className="shrink-0 text-text-muted" />
    </Link>
  );
}

export default async function MechanicSchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to bookings assigned to the signed-in mechanic. Every status
  // is included so a mechanic can open any of their jobs — active or past — and
  // step through the live stages on the detail page.
  const { data: rows } = await supabase
    .from("bookings")
    .select(
      "id, scheduled_at, status, postcode, area, total_pence, commission_rate, vehicle_make, vehicle_model, service:services(name)",
    )
    .eq("mechanic_id", user.id)
    .order("scheduled_at", { ascending: true });

  const jobs: JobItem[] = [];
  for (const b of (rows ?? []) as BookingRow[]) {
    if (!(b.status in STATUS_META)) continue;
    const status = b.status as JobStatus;
    jobs.push({
      id: b.id,
      status,
      whenLabel: whenLabel(b.scheduled_at),
      sortKey: b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0,
      title: `${serviceName(b.service)} · ${[b.vehicle_make, b.vehicle_model].filter(Boolean).join(" ") || "Vehicle"}`,
      where: b.area ?? b.postcode ?? "—",
      earnings: formatPrice(
        mechanicSharePence(b.total_pence ?? 0, b.commission_rate ?? 0.15),
      ),
    });
  }

  // Active jobs first (soonest at top); completed/cancelled/disputed below
  // (most recent at top).
  const active = jobs
    .filter((j) => ACTIVE_STATUSES.includes(j.status))
    .sort((a, b) => a.sortKey - b.sortKey);
  const past = jobs
    .filter((j) => !ACTIVE_STATUSES.includes(j.status))
    .sort((a, b) => b.sortKey - a.sortKey);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Overline>Schedule</Overline>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
          My jobs
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Every job you&apos;ve accepted. Tap one to view the details and update
          its progress.
        </p>
      </div>

      {jobs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
            <Icon icon={CalendarClock} size={26} className="text-brand-blue" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">No jobs yet</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Jobs you accept from the offers feed will appear here. Make sure
            you&apos;re online so new jobs in your area reach you.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <Card padded={false}>
              <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-bold text-text-primary">Active</h2>
                <Pill tone="active">{active.length}</Pill>
              </div>
              {active.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </Card>
          )}

          {past.length > 0 && (
            <Card padded={false}>
              <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-bold text-text-primary">
                  Completed &amp; past
                </h2>
                <span className="text-[11px] text-text-muted">
                  {past.length} job{past.length === 1 ? "" : "s"}
                </span>
              </div>
              {past.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
