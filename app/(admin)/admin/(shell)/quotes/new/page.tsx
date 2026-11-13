import { Overline } from "@/components/ui/overline";
import { QuoteForm } from "../_components/quote-form";

// Start a custom quote from the dashboard (Task 75): a customer who rang or
// emailed rather than asking through the site.

export default function NewCustomQuotePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Overline>Quotes</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">New quote</h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Price a job we don&apos;t list and email it to the customer. They book it from the link.
        </p>
      </div>
      <QuoteForm />
    </div>
  );
}
