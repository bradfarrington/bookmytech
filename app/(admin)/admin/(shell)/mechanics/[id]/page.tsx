import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, MapPin, Phone, Sparkles, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Overline } from "@/components/ui/overline";

interface MechanicDetailPageProps {
  params: Promise<{ id: string }>;
}

function statusTone(status: string): "success" | "neutral" | "active" {
  if (status === "online") return "success";
  if (status === "on_job") return "active";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "on_job") return "On job";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function MechanicDetailPage({
  params,
}: MechanicDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select(
      `id, status, base_postcode, bio, specialisms, rating, job_count, is_pro,
       service_radius_miles, approved_at, created_at,
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
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Pill tone={statusTone(mechanic.status)}>
              {statusLabel(mechanic.status)}
            </Pill>
            {mechanic.approved_at ? (
              <span className="text-xs text-text-muted">
                Approved {new Date(mechanic.approved_at).toLocaleDateString("en-GB")}
              </span>
            ) : (
              <Pill tone="pending">Pending approval</Pill>
            )}
          </div>
        </div>
      </header>

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
              mechanic.rating > 0 ? Number(mechanic.rating).toFixed(2) : "No reviews yet"
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

      <Card className="bg-surface p-6">
        <p className="text-xs text-text-muted">
          Full mechanic editing (insurance documents, suspensions, payout
          settings) lands in task 05 / 07 / 08. This page is read-only for now.
        </p>
      </Card>
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
