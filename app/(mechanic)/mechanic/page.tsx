import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle, Wrench, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions/sign-out";

export default async function MechanicHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "mechanic") redirect("/");

  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] ?? user.email?.split("@")[0] ?? "there";

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-3">
          <Link href="/" aria-label="Book My Tech — home">
            <Image
              src="/logo-no-bg.png"
              alt="Book My Tech"
              width={120}
              height={32}
              className="h-8 w-auto"
            />
          </Link>
          <form action={signOut}>
            <input type="hidden" name="redirectTo" value="/" />
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 py-12">
        <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-green-50 p-4">
          <CheckCircle size={20} className="mt-0.5 shrink-0 text-success" />
          <div>
            <p className="font-semibold text-green-900">You&apos;re signed in.</p>
            <p className="mt-0.5 text-sm text-green-800">
              Signed in as <span className="font-semibold">{user.email}</span>.
            </p>
          </div>
        </div>

        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50">
              <Wrench size={20} className="text-brand-blue" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Welcome, {firstName}.
            </h1>
          </div>
          <p className="text-text-secondary leading-relaxed">
            Your Book My Tech mechanic account is active. The full mechanic
            dashboard — job offers, schedule, earnings — is being built and
            will be live shortly.
          </p>

          <div className="rounded-xl bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
            <p className="flex items-center gap-2 font-semibold">
              <Mail size={14} />
              We&apos;ll email you when it&apos;s ready.
            </p>
            <p className="mt-1 leading-relaxed text-blue-800">
              In the meantime, an admin may be in touch to verify your insurance
              documents (public liability + trade insurance). Once approved you
              start receiving job offers in your area.
            </p>
          </div>
        </Card>

        <p className="text-center text-sm text-text-muted">
          Questions?{" "}
          <a
            href="mailto:help@bookmytech.co.uk"
            className="font-semibold text-brand-blue hover:underline"
          >
            help@bookmytech.co.uk
          </a>
        </p>
      </main>
    </div>
  );
}
