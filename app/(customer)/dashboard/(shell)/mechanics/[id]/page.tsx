import { notFound, redirect } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { isLiveStatus } from "@/lib/bookings/status-meta";
import { loadCustomerBookings } from "@/lib/dashboard/customer-bookings";
import { CLOSED_STATUSES } from "@/lib/messages/send";
import { loadMechanicProfile } from "@/lib/mechanics/profile";
import { createClient } from "@/lib/supabase/server";
import {
  AvatarTile,
  buttonClass,
  ButtonLink,
  Caption,
  Notice,
  PageHeader,
  Panel,
  Screen,
  Section,
  Stack,
  StarRating,
  StatusPill,
} from "@/components/dashboard/ui";
import { mechanicFirstName, telHref, timeAgo } from "../../_home/booking-logic";

// A mechanic's profile as their customer sees it (Task 48 on Task 51; mockup
// 04 "Mechanic profile"). loadMechanicProfile reads through the COOKIE client:
// its views only answer for mechanics on the caller's own bookings, so any other
// id is simply not found. Before migration 0074 the extras and reviews are just
// absent, and those sections don't render.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Pills({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <StatusPill key={item} tone="neutral" className="text-[11.5px] normal-case tracking-normal">
          {item}
        </StatusPill>
      ))}
    </div>
  );
}

export default async function MechanicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [result, bookings] = await Promise.all([
    loadMechanicProfile(supabase, id, { reviewLimit: 10 }),
    loadCustomerBookings({ userId: user.id, email: user.email ?? null }),
  ]);

  // Their bookings with this mechanic: the thread to message (a live one first,
  // then the most recent still open) and where Back goes.
  const withMechanic = bookings.filter((booking) => booking.mechanicId === id);
  const open = withMechanic.filter((booking) => !(CLOSED_STATUSES as readonly string[]).includes(booking.status));
  const messageBooking = open.find((booking) => isLiveStatus(booking.status)) ?? open[0] ?? null;
  const backBooking = messageBooking ?? withMechanic[0] ?? null;
  const backHref = backBooking ? `/dashboard/bookings/${backBooking.id}` : "/dashboard";

  if (!result.ok) {
    return (
      <Screen>
        <PageHeader title="Your mechanic" backHref={backHref} />
        <Notice tone="danger" title={result.error} />
      </Screen>
    );
  }

  const { profile, reviews } = result;
  if (!profile) notFound();

  const now = new Date();
  const who = mechanicFirstName(profile.fullName);
  const bio = profile.bio?.trim();
  const stats = [
    profile.jobCount === 1 ? "1 job" : `${profile.jobCount} jobs`,
    profile.joinedAt ? `joined ${timeAgo(profile.joinedAt, now)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Screen>
      <PageHeader title="Your mechanic" backHref={backHref} />
      <Stack>
        <Panel tone="float" padding="lg" className="text-center">
          <AvatarTile
            name={profile.fullName}
            src={profile.avatarUrl}
            size="xl"
            className="mx-auto size-[72px] rounded-[18px] text-[22px]"
          />
          <h2 className="mt-2.5 font-display text-[22px] font-extrabold leading-7 tracking-[-0.5px] text-text-primary">
            {profile.fullName}
          </h2>
          {profile.rating != null && (
            <div className="mt-1.5 flex items-center justify-center gap-1.5">
              <StarRating value={profile.rating} size={14} />
              <span className="text-sm font-bold text-text-primary">{profile.rating.toFixed(1)}</span>
            </div>
          )}
          <Caption className="mt-1">{stats}</Caption>
          {(profile.phone || messageBooking) && (
            <div className="mt-3.5 flex flex-wrap justify-center gap-2">
              {profile.phone && (
                <a href={telHref(profile.phone)} aria-label={`Call ${who}`} className={buttonClass()}>
                  <Phone size={16} strokeWidth={2.2} aria-hidden />
                  Call
                </a>
              )}
              {messageBooking && (
                <ButtonLink
                  href={`/dashboard/bookings/${messageBooking.id}/messages`}
                  variant="secondary"
                  icon={MessageCircle}
                >
                  Message
                </ButtonLink>
              )}
            </div>
          )}
        </Panel>

        {bio && (
          <Section title="About">
            <Panel>
              <p className="whitespace-pre-line text-sm leading-[21px] text-text-secondary">{bio}</p>
            </Panel>
          </Section>
        )}

        {profile.specialisms.length > 0 && (
          <Section title="Specialisms">
            <Pills items={profile.specialisms} />
          </Section>
        )}

        {reviews.length > 0 && (
          <Section title="Recent reviews">
            <Stack className="gap-2.5">
              {reviews.map((review) => (
                <Panel key={review.id}>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <StarRating value={review.rating} />
                    <Caption className="font-bold">
                      {review.reviewerFirstName?.trim() || "A customer"} · {timeAgo(review.createdAt, now)}
                    </Caption>
                  </div>
                  {review.comment?.trim() && (
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-[21px] text-text-secondary">
                      {review.comment.trim()}
                    </p>
                  )}
                  {review.tags.length > 0 && (
                    <div className="mt-2">
                      <Pills items={review.tags} />
                    </div>
                  )}
                  {review.mechanicResponse?.trim() && (
                    <div className="ml-3 mt-2.5 border-l-2 border-border pl-3">
                      <div className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-text-muted">
                        Reply from {who === "Your mechanic" ? "the mechanic" : who}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-[13px] leading-[19px] text-text-secondary">
                        {review.mechanicResponse.trim()}
                      </p>
                    </div>
                  )}
                </Panel>
              ))}
            </Stack>
          </Section>
        )}
      </Stack>
    </Screen>
  );
}
