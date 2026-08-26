import Link from "next/link";
import { LifeBuoy, Scale, MessageSquare } from "lucide-react";

// Permanent route to help and to the dispute history.
//
// The disputes panel above only appears when something is open, so without this
// a customer with a settled case had no way back to it once the job scrolled out
// of Past jobs — there was no list page and nothing linked to one.
export function SupportCard({ hasDisputes }: { hasDisputes: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-muted">
        Help
      </h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        <Link
          href="/help"
          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
        >
          <LifeBuoy size={17} className="shrink-0 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Help centre</span>
        </Link>

        <Link
          href="/dashboard/disputes"
          className="flex items-center gap-3 border-t border-border px-4 py-3 transition-colors hover:bg-surface"
        >
          <Scale size={17} className="shrink-0 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">
            {hasDisputes ? "Your disputes" : "Raise a dispute"}
          </span>
        </Link>

        <a
          href="mailto:support@bookmytech.co.uk"
          className="flex items-center gap-3 border-t border-border px-4 py-3 transition-colors hover:bg-surface"
        >
          <MessageSquare size={17} className="shrink-0 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Email support</span>
        </a>
      </div>
    </section>
  );
}
