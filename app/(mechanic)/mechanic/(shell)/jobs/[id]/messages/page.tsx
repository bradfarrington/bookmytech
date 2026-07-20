import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MessagesThread } from "@/components/messages/messages-thread";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MechanicMessagesPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to bookings this mechanic is assigned to / offered. We only
  // message on jobs we actually hold, so require the assignment.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, mechanic_id, customer_name, repair_description")
    .eq("id", id)
    .maybeSingle();

  if (!booking || booking.mechanic_id !== user.id) notFound();

  const repairName = booking.repair_description ?? "this job";
  const customerName = booking.customer_name?.split(" ")[0] || "the customer";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href={`/mechanic/jobs/${id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to job
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Messages — {customerName}
        </h1>
        <p className="text-sm text-text-muted">About your {repairName} booking.</p>
      </div>

      <MessagesThread bookingId={id} viewerRole="mechanic" counterpartName={customerName} />
    </div>
  );
}
