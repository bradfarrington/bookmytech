import Link from "next/link";
import { ArrowRight, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  const firstName =
    profile?.full_name?.trim().split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Overline>Operations</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Welcome back, {firstName}.
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Live operations land here as features ship. For now, the most useful
          thing is the services catalogue.
        </p>
      </header>

      <Card className="flex items-start gap-4 p-6">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
          <Icon icon={Wrench} size={20} />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold tracking-tight text-text-primary">
            Manage the services catalogue
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            The catalogue powers the services preview on the landing page and
            the booking flow when it lands. Add, edit, and reorder what you
            offer.
          </p>
          <Link href="/admin/services" className="mt-4 inline-flex">
            <Button variant="primary" size="sm" iconRight={ArrowRight}>
              Open services
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
