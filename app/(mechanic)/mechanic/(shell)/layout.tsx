import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { MechanicSidebar } from "@/components/mechanic/sidebar";
import { MechanicTopBar } from "@/components/mechanic/top-bar";
import { InstallPrompt } from "@/components/pwa/install-prompt";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "mechanic") {
    redirect("/");
  }

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("status")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Mechanic";
  const firstName = displayName.split(/\s+/)[0];
  const status = (mechanic?.status as MechanicStatus | undefined) ?? "offline";

  return (
    <div className="flex min-h-dvh bg-surface text-text-primary">
      <MechanicSidebar userName={displayName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MechanicTopBar firstName={firstName} status={status} />
        <main className="flex-1 overflow-auto p-7">{children}</main>
      </div>
      <Toaster richColors position="top-right" closeButton />
      <InstallPrompt />
    </div>
  );
}
