import { redirect } from "next/navigation";
import { availableCreditPence } from "@/lib/credits/credits";
import { groupCustomerBookings, loadCustomerBookings } from "@/lib/dashboard/customer-bookings";
import { listGarage } from "@/lib/garage/garage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn, siteUrl } from "@/lib/utils";
import { Caption, Screen, Section, Stack } from "@/components/dashboard/ui";
import { ReferralCard } from "../_components/referral-card";
import { AutoRefresh } from "../_home/auto-refresh";
import { firstNameOf, greetingDate, homeNeedsRefresh, waitingOnCustomer } from "../_home/booking-logic";
import { FirstTime } from "../_home/first-time";
import { GarageSnapshot } from "../_home/garage-snapshot";
import { LiveHero } from "../_home/live-hero";
import { PastJobs } from "../_home/past-jobs";
import { UpcomingList } from "../_home/upcoming-list";
import { WaitingCard } from "../_home/waiting-on-you";

// The customer's Home (Task 48; mockup 02 "Dashboard · Live booking" and
// "Dashboard · First-time"): greeting, a hero per live job, what's waiting on
// them, upcoming and past jobs. On a desktop a side column carries the garage
// and the referral card; on a phone they fall below.
//
// Bookings come through lib/dashboard/customer-bookings.ts, scoped to the
// cookie session's user. The profile's referral code and the credit balance are
// read with the service role for this user's id only, as before.
export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [bookings, { data: profile }, creditPence, garage] = await Promise.all([
    loadCustomerBookings({ userId: user.id, email: user.email ?? null }),
    admin.from("profiles").select("full_name, referral_code").eq("id", user.id).maybeSingle(),
    availableCreditPence(admin, user.id),
    listGarage(user.id, { refresh: false }),
  ]);

  const now = new Date();
  const { live, upcoming, past } = groupCustomerBookings(bookings);
  const waiting = waitingOnCustomer(bookings);
  const firstName = firstNameOf(profile?.full_name as string | null | undefined);
  const referralCode = (profile?.referral_code as string | null | undefined) ?? null;
  const vehicles = garage.ok && garage.available ? garage.vehicles : [];
  const hasSide = vehicles.length > 0 || !!referralCode;

  return (
    <Screen width="wide">
      {homeNeedsRefresh(bookings) && <AutoRefresh />}

      <div className="pt-4">
        <Caption>{greetingDate(now)}</Caption>
        <h1 className="mt-0.5 font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.7px] text-text-primary">
          {firstName ? `Hi, ${firstName}.` : "Hi there."}
        </h1>
      </div>

      <div className={cn("mt-4 grid items-start gap-6", hasSide && "lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8")}>
        <Stack className="min-w-0 md:gap-5">
          {bookings.length === 0 ? (
            <FirstTime />
          ) : (
            <>
              {live.map((booking) => (
                <LiveHero key={booking.id} booking={booking} />
              ))}

              {waiting.length > 0 && (
                <Section title="Waiting on you">
                  <Stack className="gap-2.5">
                    {waiting.map((item) => (
                      <WaitingCard key={item.key} item={item} showJob />
                    ))}
                  </Stack>
                </Section>
              )}

              <UpcomingList bookings={upcoming} />
              <PastJobs bookings={past} now={now} />
            </>
          )}
        </Stack>

        {hasSide && (
          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24">
            <GarageSnapshot vehicles={vehicles} />
            {referralCode && (
              <ReferralCard
                code={referralCode}
                shareUrl={`${siteUrl()}/signup?ref=${referralCode}`}
                creditPence={creditPence}
              />
            )}
          </aside>
        )}
      </div>
    </Screen>
  );
}
