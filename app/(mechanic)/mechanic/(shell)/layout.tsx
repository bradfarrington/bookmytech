import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { MechanicSidebar } from "@/components/mechanic/sidebar";
import { MechanicTopBar } from "@/components/mechanic/top-bar";
import { ConnectStripeBanner } from "@/components/mechanic/connect-stripe-banner";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { countOpenMechanicDisputes } from "@/lib/disputes/list";
import { countUnreadMechanicMessages } from "@/lib/messages/threads";

type MechanicStatus = "online" | "offline" | "on_job";

export default async function MechanicShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates /mechanic/*, but fail closed if it ever misses.
  if (!user) {
    redirect("/mechanic/login");
  }

  // Mechanic access = having a mechanics row (an admin who also works jobs
  // keeps role='admin' but holds one), so the row itself is the gate.
  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("status, stripe_payouts_enabled")
    .eq("id", user.id)
    .maybeSingle();

  if (!mechanic) {
    redirect("/");
  }

  const [{ data: profile }, openDisputes, unreadMessages] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    // Sidebar badges (Tasks 25 and 60) — read under the mechanic's own RLS, and
    // 0 on failure so a broken count can't take out the shell every mechanic
    // page renders inside.
    countOpenMechanicDisputes(supabase, user.id),
    countUnreadMechanicMessages(supabase, user.id),
  ]);
  const badges = {
    "/mechanic/disputes": openDisputes,
    "/mechanic/messages": unreadMessages,
  };

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Mechanic";
  const firstName = displayName.split(/\s+/)[0];
  const status = (mechanic?.status as MechanicStatus | undefined) ?? "offline";
  const payoutsEnabled = Boolean(mechanic?.stripe_payouts_enabled);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface text-text-primary">
      <MechanicSidebar userName={displayName} badges={badges} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MechanicTopBar
          firstName={firstName}
          userName={displayName}
          status={status}
          payoutsEnabled={payoutsEnabled}
          badges={badges}
        />
        <main className="flex-1 overflow-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-7">
          {!payoutsEnabled && <ConnectStripeBanner />}
          {children}
        </main>
      </div>
      <Toaster richColors position="top-right" closeButton />
      <InstallPrompt />
    </div>
  );
}
