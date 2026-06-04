import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SubmittedPage() {
  return (
    <Card className="space-y-5 p-8 text-center">
      <CheckCircle2 className="mx-auto size-14 text-success" />
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold text-text-primary">
          Application received
        </h1>
        <p className="text-sm text-text-secondary">
          Thanks for applying to join Book My Tech as a vetted professional.
          We've emailed you a confirmation and our team will review your
          application within <strong>48 hours</strong>.
        </p>
      </div>
      <p className="text-xs text-text-muted">
        If we need anything else, we'll email you a secure link to supply it.
      </p>
      <Link href="/" className="inline-block">
        <Button variant="secondary">Back to home</Button>
      </Link>
    </Card>
  );
}
