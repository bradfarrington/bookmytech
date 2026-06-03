import { redirect } from "next/navigation";
import { UserCircle, Activity, Star, Briefcase, CalendarDays, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Overline } from "@/components/ui/overline";
import { ProfileForm } from "./_components/profile-form";
import type { LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; tone: "success" | "neutral" | "active" }> = {
  online: { label: "Online", tone: "success" },
  offline: { label: "Offline", tone: "neutral" },
  on_job: { label: "On a job", tone: "active" },
};

export default async function MechanicProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const [{ data: profile }, { data: mechanic }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, avatar_url, created_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("mechanics")
      .select("status, rating, job_count, is_pro, base_postcode, bio, created_at")
      .eq("id", user.id)
      .single(),
  ]);

  const status = (mechanic?.status as string) ?? "offline";
  const statusMeta = STATUS_META[status] ?? STATUS_META.offline;
  const memberSince = mechanic?.created_at ?? profile?.created_at ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Overline>Mechanic</Overline>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-text-primary">
          <UserCircle size={22} className="text-brand-blue" />
          Your profile
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          How you appear to customers, plus your account stats.
        </p>
      </header>

      {/* Read-only stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          icon={Activity}
          label="Status"
          value={<Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>}
        />
        <StatTile
          icon={Star}
          label="Rating"
          value={mechanic && mechanic.rating > 0 ? `${mechanic.rating.toFixed(1)} ★` : "—"}
        />
        <StatTile icon={Briefcase} label="Total jobs" value={mechanic?.job_count ?? 0} />
        <StatTile
          icon={CalendarDays}
          label="Member since"
          value={
            memberSince
              ? new Date(memberSince).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
              : "—"
          }
        />
        <StatTile
          icon={BadgeCheck}
          label="Tier"
          value={
            mechanic?.is_pro ? <Pill tone="info">Pro</Pill> : <span className="text-text-muted">Standard</span>
          }
        />
      </div>

      <ProfileForm
        fullName={profile?.full_name ?? ""}
        phone={profile?.phone ?? ""}
        bio={mechanic?.bio ?? ""}
        basePostcode={mechanic?.base_postcode ?? null}
        avatarUrl={profile?.avatar_url ?? null}
      />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        <Icon size={13} />
        {label}
      </div>
      <div className="mt-1.5 text-sm font-bold text-text-primary">{value}</div>
    </Card>
  );
}
