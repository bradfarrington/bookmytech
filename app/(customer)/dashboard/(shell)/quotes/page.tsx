import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCustomQuotesFor } from "@/lib/custom-quotes/server";
import { Caption, PageHeader, Panel, Screen, Section, Stack } from "@/components/dashboard/ui";
import { CustomQuoteList, openQuotes } from "./_components/custom-quote-list";

// The customer's quotes (Task 75): prices we worked out by hand for jobs the
// catalogue doesn't list. Open ones first; each row opens the quote, where it
// is booked or declined. (A mechanic's quote for extra work on a booking lives
// on that booking, at /dashboard/quotes/<id>.)

export const dynamic = "force-dynamic";

export default async function CustomerQuotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/quotes");

  const quotes = await listCustomQuotesFor({ userId: user.id, email: user.email ?? null });
  const open = openQuotes(quotes);
  const closed = quotes.filter((q) => !open.includes(q));

  return (
    <Screen>
      <PageHeader title="Your quotes" backHref="/dashboard" />
      <Stack>
        {quotes.length === 0 ? (
          <Panel>
            <p className="text-sm font-bold text-text-primary">No quotes yet</p>
            <Caption className="mt-1">
              Can&apos;t find the job you need when you book? Ask us for a quote from the repair list and it will
              appear here.
            </Caption>
            <Link href="/book" className="mt-3 inline-block text-sm font-semibold text-brand-blue hover:underline">
              Start a booking
            </Link>
          </Panel>
        ) : (
          <>
            {open.length > 0 && (
              <Section title="Open">
                <CustomQuoteList quotes={open} />
              </Section>
            )}
            {closed.length > 0 && (
              <Section title="Closed">
                <CustomQuoteList quotes={closed} />
              </Section>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
}
