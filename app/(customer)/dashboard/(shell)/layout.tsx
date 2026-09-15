import { redirect } from "next/navigation";
import { AppHeader } from "@/components/dashboard/app-header";
import { loadInbox } from "@/lib/inbox/feed";
import { unreadCount } from "@/lib/inbox/read-state";
import { createClient } from "@/lib/supabase/server";

// The signed-in customer area (Task 48): every /dashboard screen except
// set-password, which is a step of the password-reset email and keeps its own
// minimal shell. proxy.ts already keeps out anyone who isn't a signed-in
// customer; the redirect below is the belt to its braces.
//
// The header's unread dot is worked out here, once per full load. Layouts
// don't re-render on client navigation, so the Inbox calls router.refresh()
// after marking things read, which re-runs this.

export default async function DashboardShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, inbox] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    loadInbox(supabase),
  ]);

  const name = (profile?.full_name as string | null | undefined)?.trim() || user.email || "You";
  const unread = inbox.ok ? unreadCount(inbox.items, inbox.readState) : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AppHeader name={name} avatarUrl={(profile?.avatar_url as string | null | undefined) ?? null} unreadCount={unread} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
