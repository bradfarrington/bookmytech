import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StepHeader } from "@/components/customer/step-header";
import { normaliseQuoteReg } from "@/lib/custom-quotes/model";
import { describeQuoteVehicle } from "@/lib/custom-quotes/href";
import { QuoteRequestForm } from "./_components/quote-request-form";

// "Can't find your job? Ask us for a quote" (Task 75). Reached from the repair
// search's empty state and under the repair list, carrying the car and what
// the customer searched for. Guests can ask; a signed-in customer's details
// are filled in and the request is tied to their account.

export const metadata: Metadata = { title: "Ask for a quote · Book My Tech" };

interface Props {
  searchParams: Promise<{ reg?: string; make?: string; model?: string; q?: string; postcode?: string; for?: string }>;
}

export default async function QuoteRequestPage({ searchParams }: Props) {
  const params = await searchParams;
  const reg = normaliseQuoteReg(params.reg) ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let name = "";
  let phone = "";
  let signedIn = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle();
    if (!profile?.role || profile.role === "customer") {
      signedIn = true;
      name = profile?.full_name ?? "";
      phone = profile?.phone ?? "";
    }
  }

  const backHref = reg ? `/book/repairs?reg=${encodeURIComponent(reg)}` : "/book";

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        backHref={backHref}
        title="Ask us for a quote"
        subtitle={
          // From a listed repair whose parts are priced by hand (2026-11-17).
          params.for === "parts"
            ? `Our team prices the parts for this job${reg ? ` on your ${describeQuoteVehicle(reg, params.make, params.model)}` : ""} by hand. Check the details and we'll email you a price.`
            : reg
            ? `Can't find the job you need for your ${describeQuoteVehicle(reg, params.make, params.model)}? Tell us about it and we'll email you a price.`
            : "Can't find the job you need? Tell us about it and we'll email you a price."
        }
      />
      <QuoteRequestForm
        initial={{
          reg,
          make: params.make ?? "",
          model: params.model ?? "",
          description: (params.q ?? "").slice(0, 200),
          name,
          email: signedIn ? (user?.email ?? "") : "",
          phone,
          postcode: (params.postcode ?? "").toUpperCase(),
        }}
        emailLocked={signedIn}
      />
    </div>
  );
}
