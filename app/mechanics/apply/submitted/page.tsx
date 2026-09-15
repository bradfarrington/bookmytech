import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Review timing matches /mechanics and its FAQ ("within a few working days");
// there is no 48-hour commitment behind the old wording.
export default function SubmittedPage() {
  return (
    <div className="rounded-[24px] border border-border bg-white px-6 py-10 text-center shadow-float sm:px-10">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/15 text-green-600">
        <CheckCircle2 className="size-8" />
      </span>
      <h1 className="mt-5 font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-text-primary">
        Application received
      </h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-[1.55] text-text-secondary">
        Thanks for applying to join Book My Tech. We&apos;ve emailed you a confirmation, and our
        team will review your application within a few working days.
      </p>
      <p className="mt-3 text-sm text-text-muted">
        If we need anything else, we&apos;ll email you a secure link to supply it.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/">
          <Button variant="primary" size="lg" className="font-bold">
            Back to home
          </Button>
        </Link>
        <Link href="/help">
          <Button
            variant="ghost"
            size="lg"
            iconRight={ArrowRight}
            className="font-bold text-text-primary hover:border-text-primary hover:bg-transparent"
          >
            Visit the help centre
          </Button>
        </Link>
      </div>
    </div>
  );
}
