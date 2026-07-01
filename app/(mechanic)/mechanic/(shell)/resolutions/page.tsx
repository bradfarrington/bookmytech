import { redirect } from "next/navigation";
import Link from "next/link";
import { LifeBuoy, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/resolutions/status-pill";
import { listCases } from "@/lib/resolutions/load";

export const dynamic = "force-dynamic";

export default async function MechanicResolutionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to the mechanic's own cases (0032).
  const cases = await listCases(supabase);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Overline>Get help</Overline>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
            Resolution Center
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Raise an issue about a job with the Book My Tech team.
          </p>
        </div>
        <Link
          href="/mechanic/resolutions/new"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
        >
          <Plus size={15} />
          Raise a case
        </Link>
      </div>

      {cases.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
            <LifeBuoy size={26} className="text-brand-blue" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">No cases yet</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            If you hit a problem with a job — you can&apos;t complete it, the customer&apos;s
            unreachable, or anything else — raise a case and we&apos;ll help sort it.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/mechanic/resolutions/${c.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-card p-4 transition-colors hover:border-brand-blue/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {c.reasonLabel}
                  </p>
                  <p className="text-xs text-text-muted">
                    Job #{c.shortRef} ·{" "}
                    {new Date(c.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <StatusPill status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
