import { Star, Shield, Zap, Award } from "lucide-react";
import { TrustBadge } from "@/components/ui/trust-badge";

const BADGES = [
  { icon: Star, value: "4.9 / 5", label: "Across 8,400+ reviews" },
  { icon: Shield, value: "DBS-checked", label: "Every mechanic vetted" },
  { icon: Zap, value: "Same-day", label: "Most jobs booked within 4 hrs" },
  { icon: Award, value: "12-month", label: "Parts & labour guarantee" },
];

export function TrustStrip() {
  return (
    <section className="border-b border-border bg-surface-card">
      <div className="mx-auto grid max-w-content gap-3 px-4 py-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {BADGES.map((b) => (
          <TrustBadge key={b.value} icon={b.icon} value={b.value} label={b.label} />
        ))}
      </div>
    </section>
  );
}
