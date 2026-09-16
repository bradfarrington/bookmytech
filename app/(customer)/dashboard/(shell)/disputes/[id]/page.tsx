import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DisputeDetail } from "@/components/disputes/dispute-detail";
import { loadDispute } from "@/lib/disputes/load";
import { Notice, PageHeader, Screen, Stack } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

// One dispute, for the customer (Task 48: inside the dashboard shell). The body
// is the shared components/disputes/dispute-detail.tsx, which the mechanic and
// admin sides also use, so it keeps its own look.

export default async function CustomerDisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const loaded = await loadDispute(id, { userId: user.id, email: user.email ?? null });
  if (!loaded || loaded.viewerRole !== "customer") redirect("/dashboard");

  const talking = loaded.data.status === "opened" || loaded.data.status === "responded";

  return (
    <Screen>
      <PageHeader title="Dispute" backHref={`/dashboard/bookings/${loaded.bookingId}`} />
      <Stack>
        {talking && (
          <Notice icon={MessagesSquare} title="Talk it through with your mechanic">
            Replies appear in the conversation below. If you can&apos;t sort it out between you, ask Book My Tech to
            step in.
          </Notice>
        )}
        <DisputeDetail data={loaded.data} viewerRole="customer" isOpener={loaded.isOpener} />
      </Stack>
    </Screen>
  );
}
