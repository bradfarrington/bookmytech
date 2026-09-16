import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CreditCard, KeyRound, LifeBuoy, Mail, MailCheck, MapPin } from "lucide-react";
import { signOut } from "@/app/actions/sign-out";
import {
  AvatarTile,
  Button,
  Caption,
  ListCard,
  ListRow,
  Notice,
  PageHeader,
  Panel,
  Screen,
  Section,
  Stack,
} from "@/components/dashboard/ui";
import { listAddresses, type AddressList } from "@/lib/addresses/store";
import { listSavedCards } from "@/lib/payments/saved-cards";
import { createClient } from "@/lib/supabase/server";
import { DetailsForm } from "./_components/details-form";

// Account (Task 48, mockup 05 "Settings"): profile card, the details form, the
// account rows, support, sign out and delete.
//
// ?email=changed is LEGACY, kept deliberately. Task 58 moved email changes onto
// our own link and success screen (/account/confirm-email), so nothing we send
// points here any more — but confirmation emails GoTrue sent before that deploy
// are still sitting in inboxes, and their links go through Supabase's verify
// endpoint to this exact path. Leaving the flag in means an in-flight change
// still lands somewhere that makes sense. Safe to delete once none can remain
// (they expire in 24 hours).

interface ProfileRow {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string | null;
  reminders_enabled: boolean | null;
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
  eftpos_au: "eftpos",
  interac: "Interac",
};

function addressCaption(result: AddressList): string {
  if (!result.ok) return "Manage your addresses";
  const address = result.addresses.find((a) => a.isDefault) ?? result.addresses[0];
  return address ? address.label : "Add an address";
}

/** Stripe is a network call, so this caption streams in rather than holding the page. */
async function CardsCaption({ userId }: { userId: string }) {
  const result = await listSavedCards(userId);
  if (!result.ok) return <>Manage your cards</>;
  const card = result.cards.find((c) => c.isDefault) ?? result.cards[0];
  if (!card) return <>Add a card</>;
  return (
    <>
      {CARD_BRANDS[card.brand] ?? "Card"} · {card.last4}
    </>
  );
}

function CaptionPlaceholder() {
  return (
    <span className="inline-block h-3 w-24 animate-pulse rounded bg-border-subtle align-middle motion-reduce:animate-none">
      <span className="sr-only">Loading</span>
    </span>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const { email: emailFlag } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, addresses] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, avatar_url, created_at, reminders_enabled")
      .eq("id", user.id)
      .maybeSingle(),
    listAddresses(supabase, user.id),
  ]);
  const profile = data as ProfileRow | null;

  const email = user.email ?? "";
  const name = profile?.full_name?.trim() || email || "You";
  const memberSince = profile?.created_at ? MONTH_YEAR.format(new Date(profile.created_at)) : null;
  const remindersOn = profile?.reminders_enabled ?? true;

  return (
    <Screen>
      <PageHeader title="Settings" />
      <Stack>
        {emailFlag === "changed" &&
          (user.new_email ? (
            // Secure Email Change: one of the two links has been opened.
            <Notice icon={MailCheck} title="Thanks, that's one confirmed">
              Open the link we sent to your other address to finish changing your email.
            </Notice>
          ) : (
            <Notice icon={MailCheck} title="Email address changed">
              You now sign in as <span className="break-all font-semibold text-text-primary">{email}</span>.
            </Notice>
          ))}

        <Panel tone="float" padding="lg" className="text-center">
          <div className="flex justify-center">
            <AvatarTile name={name} src={profile?.avatar_url} size="xl" />
          </div>
          <div className="mt-2.5 font-display text-lg font-bold leading-6 tracking-[-0.3px] text-text-primary">
            {name}
          </div>
          <Caption className="mt-0.5 break-all">{email}</Caption>
          {memberSince && <Caption className="mt-0.5">Member since {memberSince}</Caption>}
        </Panel>

        <Section title="Your details">
          <DetailsForm defaultName={profile?.full_name ?? ""} defaultPhone={profile?.phone ?? ""} />
        </Section>

        <Section title="Account">
          <ListCard>
            <ListRow
              href="/dashboard/settings/reminders"
              icon={Bell}
              title="Service reminders"
              caption={remindersOn ? "On" : "Off"}
            />
            <ListRow
              href="/dashboard/settings/email"
              icon={Mail}
              title="Email address"
              caption={<span className="block truncate">{email}</span>}
            />
            <ListRow
              href="/dashboard/settings/password"
              icon={KeyRound}
              title="Password"
              caption="Change the password you sign in with"
            />
            <ListRow
              href="/dashboard/settings/payment-methods"
              icon={CreditCard}
              title="Payment methods"
              caption={
                <Suspense fallback={<CaptionPlaceholder />}>
                  <CardsCaption userId={user.id} />
                </Suspense>
              }
            />
            <ListRow
              href="/dashboard/settings/addresses"
              icon={MapPin}
              title="Addresses"
              caption={<span className="block truncate">{addressCaption(addresses)}</span>}
            />
          </ListCard>
        </Section>

        <Section title="Support">
          <ListCard>
            <ListRow href="/dashboard/help" icon={LifeBuoy} title="Help centre" caption="FAQs and get in touch" />
          </ListCard>
        </Section>

        <form action={signOut} className="mt-2">
          <input type="hidden" name="redirectTo" value="/login" />
          <Button type="submit" variant="ghost" full>
            Sign out
          </Button>
        </form>

        <div className="text-center">
          <Link
            href="/dashboard/settings/delete"
            className="text-sm font-semibold text-danger transition-colors hover:text-red-700"
          >
            Delete account
          </Link>
        </div>
      </Stack>
    </Screen>
  );
}
