import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, PoundSterling, Users, CalendarCheck, Activity, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { Card } from "@/components/ui/card";
import { KPI } from "@/components/ui/kpi";
import { Pill } from "@/components/ui/pill";
import { formatPrice, siteUrl } from "@/lib/utils";
import { resolveArea, type AreaRow } from "@/lib/pricing/calculate";
import { AreaStatusControl } from "./_components/area-status-control";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set(["sourcing_mechanic", "confirmed", "en_route", "in_progress"]);

const APP_STATUS_TONE: Record<string, "success" | "pending" | "error" | "neutral" | "active"> = {
  submitted: "pending",
  under_review: "active",
  approved: "success",
  approved_with_grace: "success",
  rejected: "error",
  needs_info: "neutral",
};

export default async function AdminAreaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: area, error } = await supabase
    .from("areas")
    .select(
      "id, name, slug, postcode_prefixes, labour_multiplier, status, target_mechanic_count, referral_code, recruitment_headline, recruitment_blurb, acquisition_budget_pence, launch_checklist",
    )
    .eq("id", id)
    .single();
  if (error || !area) notFound();

  const [{ data: allAreas }, { data: bookings }, { data: mechanics }, { data: applications }] =
    await Promise.all([
      supabase.from("areas").select("id, name, postcode_prefixes, labour_multiplier"),
      supabase.from("bookings").select("area_id, total_pence, status").eq("area_id", id).limit(5000),
      supabase.from("mechanics").select("base_postcode, status"),
      supabase
        .from("mechanic_applications")
        .select("id, full_name, postcode, status, submitted_at")
        .eq("source_area_id", id)
        .order("submitted_at", { ascending: false }),
    ]);

  const bookingRows = bookings ?? [];
  const bookingsCount = bookingRows.length;
  const gmv = bookingRows.filter((b) => b.status !== "cancelled").reduce((s, b) => s + (b.total_pence ?? 0), 0);
  const activeDemand = bookingRows.filter((b) => ACTIVE_STATUSES.has(b.status)).length;

  // Mechanics whose base postcode resolves to this area.
  const mechCount = (mechanics ?? []).filter(
    (m) => resolveArea(m.base_postcode ?? "", (allAreas ?? []) as AreaRow[])?.id === id,
  ).length;

  const target = area.target_mechanic_count;
  const recruitUrl = `${siteUrl()}/mechanics/${area.slug ?? ""}`;
  const checklist = (area.launch_checklist ?? {}) as Record<string, boolean>;
  const checklistDone = Object.values(checklist).filter(Boolean).length;
  const checklistTotal = Object.keys(checklist).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/areas"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to areas
        </Link>
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Overline>Commercial · Areas</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">{area.name}</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            ×{Number(area.labour_multiplier).toFixed(3)} labour ·{" "}
            {(area.postcode_prefixes ?? []).length
              ? (area.postcode_prefixes ?? []).join(", ")
              : "catch-all (no prefixes)"}
          </p>
        </div>
        <AreaStatusControl areaId={area.id} status={area.status} />
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="GMV" value={formatPrice(gmv)} icon={PoundSterling} />
        <KPI
          label="Mechanics"
          value={target ? `${mechCount} / ${target}` : mechCount}
          icon={Users}
          delta={target ? `${Math.round((mechCount / target) * 100)}% of target` : undefined}
        />
        <KPI label="Bookings" value={bookingsCount} icon={CalendarCheck} />
        <KPI
          label="Active demand"
          value={activeDemand}
          icon={Activity}
          delta={`${mechCount} mechanics covering`}
          deltaTone={activeDemand > mechCount * 2 ? "error" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recruitment */}
        <Card className="space-y-4 p-6">
          <h2 className="text-sm font-bold tracking-tight text-text-primary">Recruitment</h2>
          {area.recruitment_headline && (
            <p className="text-sm font-semibold text-text-primary">{area.recruitment_headline}</p>
          )}
          {area.recruitment_blurb && (
            <p className="text-sm text-text-secondary">{area.recruitment_blurb}</p>
          )}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-text-muted">Public recruitment page</span>
            <a
              href={`/mechanics/${area.slug ?? ""}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 break-all rounded-button border border-border bg-surface px-3 py-2 text-sm text-brand-blue hover:underline"
            >
              {recruitUrl}
              <ExternalLink size={13} className="shrink-0" />
            </a>
          </div>
          {area.referral_code && (
            <p className="text-xs text-text-muted">
              Referral code: <code className="font-mono text-text-secondary">{area.referral_code}</code>
            </p>
          )}
          {area.acquisition_budget_pence != null && (
            <p className="text-xs text-text-muted">
              Acquisition budget: {formatPrice(area.acquisition_budget_pence)}
            </p>
          )}
        </Card>

        {/* Launch checklist */}
        <Card className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight text-text-primary">Launch checklist</h2>
            {checklistTotal > 0 && (
              <span className="text-xs font-semibold text-text-muted">
                {checklistDone}/{checklistTotal} done
              </span>
            )}
          </div>
          {checklistTotal > 0 ? (
            <ul className="space-y-2 text-sm">
              {Object.entries(checklist).map(([key, done]) => (
                <li key={key} className="flex items-center gap-2.5">
                  <span
                    className={
                      done
                        ? "flex size-4 items-center justify-center rounded-full bg-success text-[10px] font-bold text-white"
                        : "size-4 rounded-full border border-border"
                    }
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className={done ? "text-text-secondary line-through" : "text-text-secondary"}>
                    {key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No checklist captured for this area.</p>
          )}
        </Card>
      </div>

      {/* Applications from this area */}
      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          Applications from this area ({(applications ?? []).length})
        </h2>
        {(applications ?? []).length > 0 ? (
          <ul className="divide-y divide-border/60">
            {(applications ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <Link href={`/admin/approvals?id=${a.id}`} className="text-sm font-semibold text-text-primary hover:text-brand-blue">
                    {a.full_name}
                  </Link>
                  <div className="text-xs text-text-muted">
                    {a.postcode} ·{" "}
                    {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-GB") : "—"}
                  </div>
                </div>
                <Pill tone={APP_STATUS_TONE[a.status] ?? "neutral"}>{a.status.replace(/_/g, " ")}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">
            No applications tagged to this area yet. Share the recruitment link to start tracking.
          </p>
        )}
      </Card>
    </div>
  );
}
