import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { loadCustomerBooking } from "@/lib/dashboard/customer-bookings";
import { CLOSED_STATUSES, MAX_MESSAGE_CHARS } from "@/lib/messages/send";
import { createClient } from "@/lib/supabase/server";
import { AvatarTile, Caption, Notice, PageHeader, Screen } from "@/components/dashboard/ui";
import { mechanicFirstName } from "../../../_home/booking-logic";
import { CustomerChat } from "./_components/customer-chat";

// A booking's messages with its mechanic (Task 48; mockup 04 "Messages"). The
// booking is read for the cookie session's user only; the thread itself is read
// in the browser under the messages RLS policy.
export const dynamic = "force-dynamic";

export default async function BookingMessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const booking = await loadCustomerBooking({ userId: user.id, email: user.email ?? null }, id);
  if (!booking) notFound();

  const backHref = `/dashboard/bookings/${booking.id}`;
  const mechanic = booking.mechanic;

  if (!mechanic) {
    return (
      <Screen>
        <PageHeader title="Messages" backHref={backHref} backLabel="Back to your booking" />
        <Notice icon={MessageCircle} title="No mechanic yet">
          {booking.status === "sourcing_mechanic"
            ? "You can message your mechanic here once one accepts your job. You'll get an email the moment one does."
            : "This booking doesn't have a mechanic, so there's no one to message."}
        </Notice>
      </Screen>
    );
  }

  const who = mechanicFirstName(mechanic.name);
  const closedMessage = (CLOSED_STATUSES as readonly string[]).includes(booking.status)
    ? booking.status === "cancelled"
      ? "This booking was cancelled, so you can't send new messages."
      : "This job is complete, so you can't send new messages."
    : null;

  return (
    <Screen className="pb-0">
      <PageHeader
        backHref={backHref}
        backLabel="Back to your booking"
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <AvatarTile name={mechanic.name} src={mechanic.avatarUrl} size="sm" className="size-9 rounded-[10px]" />
            <span className="truncate">{mechanic.name}</span>
          </span>
        }
      />
      <Caption className="-mt-1 truncate">About your {booking.repairDescription}</Caption>
      <CustomerChat
        bookingId={booking.id}
        mechanicName={who}
        maxChars={MAX_MESSAGE_CHARS}
        closedMessage={closedMessage}
      />
    </Screen>
  );
}
