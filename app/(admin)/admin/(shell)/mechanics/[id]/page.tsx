import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Star,
  Flag,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Stars } from "@/components/ui/stars";
import { Overline } from "@/components/ui/overline";
import { cn, formatPrice } from "@/lib/utils";
import { SuspensionControls } from "@/components/admin/suspension-controls";

interface MechanicDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type Tab = "overview" | "jobs" | "reviews";

function statusTone(status: string): "success" | "neutral" | "active" {
  if (status === "online") return "success";
  if (status === "on_job") return "active";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "on_job") return "On job";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// --- Booking status display (mirrors the All jobs table) ---
const LIVE_STATUSES = new Set(["confirmed", "en_route", "in_progress"]);

function jobStatusTone(
  status: string,
): "active" | "success" | "pending" | "error" | "neutral" {
  if (LIVE_STATUSES.has(status)) return "active";
  if (status === "completed") return "success";
  if (status === "sourcing_mechanic") return "pending";
  if (status === "disputed") return "error";
  return "neutral";
}

const JOB_STATUS_LABEL: Record<string, string> = {
  sourcing_mechanic: "Sourcing",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function firstName(name: string) {
  return name?.trim().split(/\s+/)[0] || "Customer";
}

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function MechanicDetailPage({
  params,
  searchParams,
}: MechanicDetailPageProps) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab =
    tabParam === "jobs" || tabParam === "reviews" ? tabParam : "overview";

  const supabase = await createClient();

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select(
      `id, status, base_postcode, bio, specialisms, rating, job_count, is_pro,
       service_radius_miles, approved_at, created_at, is_suspended, suspended_until,
       profile:profiles!inner(full_name, phone, role)`,
    )
    .eq("id", id)
    .single();

  if (!mechanic) notFound();

  const profile = Array.isArray(mechanic.profile)
    ? mechanic.profile[0]
    : mechanic.profile;

  // Resolve email via the admin client — auth.users isn't reachable via RLS.
  const admin = createAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(id);
  const email = userData?.user?.email ?? null;
  // Invited until they've signed in at least once via the magic-link invite.
  const activated = Boolean(userData?.user?.last_sign_in_at);

  // Suspension history + open performance flags (Task 12), the mechanic's job
  // history, and the reviews they've received — all keyed on mechanic_id.
  const [{ data: suspensions }, { data: flags }, { data: jobsRaw }, { data: reviewsRaw }] =
    await Promise.all([
      admin
        .from("mechanic_suspensions")
        .select("id, reason, suspended_at, suspended_until, lifted_at")
        .eq("mechanic_id", id)
        .order("suspended_at", { ascending: false }),
      admin
        .from("mechanic_flags")
        .select("id, flag_type, severity, notes, created_at")
        .eq("mechanic_id", id)
        .is("resolved_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("bookings")
        .select(
          "id, status, area, total_pence, customer_name, service_id, scheduled_at, created_at",
        )
        .eq("mechanic_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select(
          `id, rating, tags, comment, mechanic_response, created_at, booking_id,
           booking:bookings(customer_name)`,
        )
        .eq("mechanic_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const jobs = jobsRaw ?? [];
  const reviews = reviewsRaw ?? [];

  // Resolve service names for the job list.
  const serviceIds = [...new Set(jobs.map((b) => b.service_id).filter(Boolean))];
  const { data: services } = serviceIds.length
    ? await supabase.from("services").select("id, name").in("id", serviceIds)
    : { data: [] as { id: string; name: string }[] };
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));

  const TABS: ReadonlyArray<{ value: Tab; label: string; count?: number }> = [
    { value: "overview", label: "Overview" },
    { value: "jobs", label: "Jobs", count: jobs.length },
    { value: "reviews", label: "Reviews", count: reviews.length },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/mechanics">
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
          Back to mechanics
        </Button>
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Overline>Network</Overline>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              {profile?.full_name ?? "Unnamed mechanic"}
            </h1>
            {mechanic.is_pro && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-brand-blue">
                <Sparkles size={12} />
                Pro
              </span>
            )}
            {mechanic.is_suspended && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                Suspended
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {activated ? (
              <Pill tone={statusTone(mechanic.status)}>
                {statusLabel(mechanic.status)}
              </Pill>
            ) : (
              <Pill tone="pending" title="Invite sent — not yet accepted">
                Invited
              </Pill>
            )}
            {!activated ? (
              <span className="text-xs text-text-muted">
                Invite sent {new Date(mechanic.created_at).toLocaleDateString("en-GB")} · awaiting sign-in
              </span>
            ) : mechanic.approved_at ? (
              <span className="text-xs text-text-muted">
                Approved {new Date(mechanic.approved_at).toLocaleDateString("en-GB")}
              </span>
            ) : (
              <Pill tone="pending">Pending approval</Pill>
            )}
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <Link
              key={t.value}
              href={`/admin/mechanics/${id}?tab=${t.value}`}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-brand-blue text-brand-blue"
                  : "border-transparent text-text-muted hover:text-text-secondary",
              )}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    active
                      ? "bg-blue-50 text-brand-blue"
                      : "bg-surface text-text-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-4 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
                Contact
              </h2>
              <Row icon={Mail} label="Email" value={email ?? "—"} />
              <Row icon={Phone} label="Phone" value={profile?.phone ?? "—"} />
              <Row
                icon={MapPin}
                label="Base postcode"
                value={
                  mechanic.base_postcode
                    ? `${mechanic.base_postcode} · ${mechanic.service_radius_miles}-mile radius`
                    : "Not set"
                }
              />
            </Card>

            <Card className="space-y-4 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
                Performance
              </h2>
              <Row
                icon={Star}
                label="Rating"
                value={
                  mechanic.rating > 0
                    ? `${Number(mechanic.rating).toFixed(2)} · ${reviews.length} review${reviews.length === 1 ? "" : "s"}`
                    : "No reviews yet"
                }
              />
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-text-muted">
                  <span className="text-xs font-bold">#</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                    Completed jobs
                  </p>
                  <p className="text-sm font-semibold text-text-primary">
                    {mechanic.job_count}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="space-y-4 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
              Specialisms
            </h2>
            {mechanic.specialisms && mechanic.specialisms.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mechanic.specialisms.map((slug: string) => (
                  <Pill key={slug} tone="neutral">
                    {slug}
                  </Pill>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">None set.</p>
            )}
          </Card>

          {mechanic.bio && (
            <Card className="space-y-2 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
                Bio
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                {mechanic.bio}
              </p>
            </Card>
          )}

          {/* Performance flags */}
          {flags && flags.length > 0 && (
            <Card className="space-y-3 p-6">
              <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-text-muted">
                <Flag size={14} /> Performance flags
              </h2>
              <ul className="space-y-2">
                {flags.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold text-text-primary">{f.flag_type.replace(/_/g, " ")}</p>
                      {f.notes && <p className="text-xs text-text-muted">{f.notes}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        f.severity === "high"
                          ? "bg-red-50 text-red-600"
                          : f.severity === "medium"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-surface-card text-text-muted"
                      }`}
                    >
                      {f.severity}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Account status — suspend / lift */}
          <Card className="space-y-4 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Account status</h2>
            <SuspensionControls
              mechanicId={mechanic.id}
              isSuspended={mechanic.is_suspended ?? false}
              suspendedUntil={mechanic.suspended_until ?? null}
            />
            {suspensions && suspensions.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Suspension history</p>
                <ul className="space-y-2 text-sm">
                  {suspensions.map((s) => (
                    <li key={s.id} className="rounded-lg bg-surface px-3 py-2">
                      <p className="text-text-primary">{s.reason}</p>
                      <p className="text-xs text-text-muted">
                        {new Date(s.suspended_at).toLocaleDateString("en-GB")} →{" "}
                        {s.lifted_at
                          ? `lifted ${new Date(s.lifted_at).toLocaleDateString("en-GB")}`
                          : s.suspended_until
                            ? `until ${new Date(s.suspended_until).toLocaleDateString("en-GB")}`
                            : "indefinite"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "jobs" && (
        <>
          {jobs.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm font-semibold text-text-secondary">No jobs yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
                Jobs this mechanic has been assigned will appear here.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                    <tr>
                      <th className="px-5 py-3">Job</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Scheduled</th>
                      <th className="px-5 py-3">Total</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {jobs.map((j) => (
                      <tr key={j.id} className="hover:bg-surface/50">
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/jobs/${j.id}`}
                            className="font-semibold text-text-primary hover:text-brand-blue"
                          >
                            {serviceName.get(j.service_id) ?? "Service"}
                          </Link>
                          <p className="text-xs text-text-muted">
                            {j.customer_name ?? "—"}
                            {j.area ? ` · ${j.area}` : ""}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <Pill tone={jobStatusTone(j.status)}>
                            {jobStatusLabel(j.status)}
                          </Pill>
                        </td>
                        <td className="px-5 py-3 text-text-secondary">
                          {formatDateTime(j.scheduled_at)}
                        </td>
                        <td className="px-5 py-3 font-semibold text-text-primary">
                          {formatPrice(j.total_pence ?? 0)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/admin/jobs/${j.id}`}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"
                          >
                            View
                            <ChevronRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === "reviews" && (
        <>
          {reviews.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
                <Star size={26} className="text-brand-blue" />
              </div>
              <h2 className="text-lg font-bold text-text-primary">No reviews yet</h2>
              <p className="max-w-sm text-sm text-text-secondary">
                Once customers rate this mechanic&apos;s completed jobs, their
                reviews will appear here.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => {
                const customerName =
                  one(r.booking as never as { customer_name?: string })
                    ?.customer_name ?? "Customer";
                const tags = Array.isArray(r.tags) ? r.tags : [];
                return (
                  <Card key={r.id} className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {firstName(customerName)}
                        </p>
                        <Stars value={r.rating} size={15} className="mt-0.5" />
                      </div>
                      <span className="shrink-0 text-xs text-text-muted">
                        {formatDate(r.created_at)}
                      </span>
                    </div>

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t: string) => (
                          <span
                            key={t}
                            className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-brand-blue"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {r.comment && (
                      <p className="text-sm leading-relaxed text-text-secondary">
                        {r.comment}
                      </p>
                    )}

                    {r.mechanic_response && (
                      <div className="rounded-xl border border-border-subtle bg-surface px-3.5 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                          Mechanic reply
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">
                          {r.mechanic_response}
                        </p>
                      </div>
                    )}

                    {r.booking_id && (
                      <Link
                        href={`/admin/jobs/${r.booking_id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"
                      >
                        View job
                        <ChevronRight size={14} />
                      </Link>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          {label}
        </p>
        <p className="break-words text-sm font-semibold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}
