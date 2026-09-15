import { redirect } from "next/navigation";
import { Check, Clock, CreditCard, TriangleAlert, Wifi } from "lucide-react";
import {
  Caption,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  Screen,
  Section,
  Stack,
  StatusPill,
} from "@/components/dashboard/ui";
import { availableCreditPence } from "@/lib/credits/credits";
import { MAX_SAVED_CARDS, listSavedCards, type SavedCard } from "@/lib/payments/saved-cards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPrice } from "@/lib/utils";
import { AddCard } from "./_components/add-card";
import { CardActions } from "./_components/card-actions";
import { StripSetupReturn } from "./_components/strip-setup-return";
import { cardBrandLabel, cardExpiry, isCardExpired, setupReturnStatus } from "./_lib/cards";

// Payment methods (Task 48, mockup 05 "Payment methods"): the customer's saved
// cards from lib/payments/saved-cards.ts (Task 53) and their account credit.

function CardVisual({ card, now }: { card: SavedCard; now: Date }) {
  const brand = cardBrandLabel(card.brand);
  const expired = isCardExpired(card.expMonth, card.expYear, now);
  const onDark = card.isDefault;
  const soft = onDark ? "text-white/70" : "text-text-muted";
  return (
    <div
      className={cn(
        "flex min-h-[110px] flex-col justify-between rounded-2xl px-4 py-3.5",
        onDark
          ? "bg-brand-gradient-deep text-white shadow-float"
          : "border border-border bg-surface-card text-text-primary shadow-card",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn("text-xs font-bold uppercase tracking-[0.1em]", soft)}>{brand}</span>
          {card.isDefault && <StatusPill tone="active">Default</StatusPill>}
          {expired && <StatusPill tone="error">Expired</StatusPill>}
        </div>
        <Wifi size={22} aria-hidden className={cn("shrink-0 rotate-90", onDark ? "text-white/50" : "text-text-disabled")} />
      </div>
      <div>
        <div className="font-display text-base font-bold tracking-[2px]">
          <span className="sr-only">Card ending </span>
          <span aria-hidden>•••• </span>
          {card.last4}
        </div>
        <div className={cn("mt-2 flex items-center justify-between gap-3 text-xs leading-4", soft)}>
          <span className="min-w-0 truncate">{card.holderName ?? ""}</span>
          {cardExpiry(card.expMonth, card.expYear) && (
            <span className="shrink-0">
              <span className="sr-only">Expires </span>
              {cardExpiry(card.expMonth, card.expYear)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const returned = setupReturnStatus(await searchParams);
  const [cards, creditPence] = await Promise.all([
    listSavedCards(user.id),
    availableCreditPence(createAdminClient(), user.id),
  ]);
  const now = new Date();

  return (
    <Screen>
      {returned && <StripSetupReturn />}
      <PageHeader title="Payment methods" backHref="/dashboard/settings" backLabel="Back to settings" />

      <Stack>
        <div>
          <div className="font-display text-[26px] font-extrabold leading-8 tracking-[-0.7px] text-text-primary">
            Cards on file
          </div>
          <p className="mt-1.5 text-sm leading-5 text-text-secondary">
            Your cards are stored by Stripe, our payment provider, not by Book My Tech. We never see your full card
            number. Your saved cards are offered when you pay for a booking.
          </p>
        </div>

        {returned === "succeeded" && <Notice icon={Check} title="Your card has been saved." />}
        {returned === "processing" && (
          <Notice icon={Clock} title="We're still checking your card.">
            It will appear here once your bank has confirmed it.
          </Notice>
        )}
        {returned === "failed" && (
          <Notice tone="danger" icon={TriangleAlert} title="Your card wasn't saved.">
            Please try again, or use a different card.
          </Notice>
        )}

        {!cards.ok ? (
          <Notice tone="danger" icon={TriangleAlert} title={cards.error} />
        ) : (
          <>
            {cards.cards.length === 0 ? (
              <EmptyState icon={CreditCard} title="No saved cards" body="Add a card to keep it on file for your bookings." />
            ) : (
              cards.cards.map((card) => (
                <div key={card.id} className="flex flex-col gap-2">
                  <CardVisual card={card} now={now} />
                  <CardActions
                    id={card.id}
                    name={`${cardBrandLabel(card.brand)} ending ${card.last4}`}
                    isDefault={card.isDefault}
                  />
                </div>
              ))
            )}
            {cards.cards.length >= MAX_SAVED_CARDS ? (
              <Caption className="text-center">
                You can save up to {MAX_SAVED_CARDS} cards. Remove one to add another.
              </Caption>
            ) : (
              <AddCard />
            )}
          </>
        )}

        <Section title="Account credit" className="mt-1.5">
          <Panel>
            <Caption>Balance</Caption>
            <div className="mt-1 font-display text-[22px] font-extrabold leading-7 tracking-[-0.5px] text-text-primary">
              {formatPrice(creditPence)}
            </div>
            <div className="my-3 h-px bg-border-subtle" />
            <p className="text-xs leading-4 text-text-secondary">
              Taken off your next booking automatically when you book while signed in.
            </p>
          </Panel>
        </Section>
      </Stack>
    </Screen>
  );
}
