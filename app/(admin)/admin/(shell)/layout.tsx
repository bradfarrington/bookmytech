import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopBar } from "@/components/admin/top-bar";
import { FlashToast } from "./_components/flash-toast";

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already enforces this, but if the matcher ever misses or
  // someone hits a sub-route before the cookie refresh completes, fail closed.
  if (!user) {
    redirect("/admin/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Admin";
  const displayRole = profile?.role ?? "admin";

  return (
    <div className="flex min-h-dvh bg-surface text-text-primary">
      <AdminSidebar userName={displayName} userRole={displayRole} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar />
        <main className="flex-1 overflow-auto p-7">{children}</main>
      </div>
      <Toaster richColors position="top-right" closeButton />
      <FlashToast />
    </div>
  );
}
