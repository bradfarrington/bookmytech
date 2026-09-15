import { Award, Clock, CreditCard, Gauge, ShieldCheck, ThumbsUp } from "lucide-react";
import { FactTicker, type TickerFact } from "@/components/ui/fact-ticker";

// Only claims the product and the customer terms back up. No invented counts or
// ratings. The evidence for each:
//   vetted:      terms "Book My Tech vets every mechanic before they are onboarded"
//   warranty:    terms, 12 months or 12,000 miles on eligible parts and labour
//   pre-auth:    manual-capture PaymentIntent, captured when the job completes
//   approval:    extra work needs the customer's approval (quotes, revisions)
//   book times:  repairs priced from manufacturer repair times (lib/haynespro)
//   windows:     2-hour arrival windows, 8am to 8pm, 60-minute minimum lead (lib/slots.ts)
// DBS checks were removed from the platform: never claim them.
const FACTS: TickerFact[] = [
  { icon: ShieldCheck, value: "Vetted mechanics", label: "checked before they join" },
  { icon: Award, value: "12-month warranty", label: "on eligible parts and labour" },
  { icon: CreditCard, value: "Nothing charged upfront", label: "paid when the job's done" },
  { icon: ThumbsUp, value: "Your approval first", label: "for any extra work" },
  { icon: Gauge, value: "Manufacturer repair times", label: "priced for your exact car" },
  { icon: Clock, value: "2-hour arrival windows", label: "8am to 8pm" },
];

export function TrustTicker() {
  return <FactTicker facts={FACTS} label="Why drivers book with Book My Tech" />;
}
