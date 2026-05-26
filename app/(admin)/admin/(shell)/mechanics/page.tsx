import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import {
  MechanicsTable,
  type MechanicRow,
} from "./_components/mechanics-table";

export default async function AdminMechanicsListPage() {
  const supabase = await createClient();

  // Mechanics + their profile names. Email lives on auth.users so we resolve
  // it separately via the admin client below — there's no FK we can join here.
  const { data: rows, error } = await supabase
    .from("mechanics")
    .select(
      `id, status, base_postcode, rating, job_count, is_pro, service_radius_miles, approved_at,
       profile:profiles!inner(full_name)`,
    )
    .order("created_at", { ascending: false });

  let emailsById = new Map<string, string>();
  if (rows && rows.length > 0) {
    const admin = createAdminClient();
    const { data: usersPage } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const ids = new Set(rows.map((r) => r.id));
    for (const u of usersPage?.users ?? []) {
      if (u.email && ids.has(u.id)) emailsById.set(u.id, u.email);
    }
  }

  const mechanics: MechanicRow[] = (rows ?? []).map((r) => {
    const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    return {
      id: r.id,
      full_name: profile?.full_name ?? null,
      email: emailsById.get(r.id) ?? "—",
      base_postcode: r.base_postcode,
      status: r.status as MechanicRow["status"],
      rating: typeof r.rating === "number" ? r.rating : Number(r.rating ?? 0),
      job_count: r.job_count,
      is_pro: r.is_pro,
      service_radius_miles: r.service_radius_miles,
      approved_at: r.approved_at,
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Network</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Mechanics
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            The mechanic roster. Manual creation here is a placeholder until
            proper onboarding lands in task 07. Invited mechanics receive an
            MJML magic-link email.
          </p>
        </div>
        <Link href="/admin/mechanics/new">
          <Button variant="primary" iconLeft={Plus}>
            Add mechanic
          </Button>
        </Link>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load mechanics: {error.message}
        </div>
      )}

      <MechanicsTable mechanics={mechanics} />
    </div>
  );
}
