import { Zap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Stars } from "@/components/ui/stars";
import { cn } from "@/lib/utils";

type PreviewMechanic = {
  name: string;
  rating: number;
  jobs: number;
  eta: string;
  price: string;
  featured?: boolean;
};

// Seed mechanics — verbatim from the proposal hero. Will be replaced with a
// real Supabase query once mechanics exist in the system (post-Phase 2).
const PREVIEW_MECHANICS: PreviewMechanic[] = [
  { name: "James M.", rating: 4.9, jobs: 312, eta: "Today, 14:00", price: "£89", featured: true },
  { name: "Priya S.", rating: 4.8, jobs: 198, eta: "Today, 16:30", price: "£94" },
  { name: "Tom W.", rating: 4.9, jobs: 421, eta: "Tomorrow, 09:00", price: "£87" },
];

export function MechanicPreviewCard() {
  return (
    <Card
      padded={false}
      className="w-full max-w-[420px] overflow-hidden border-0 shadow-hero"
    >
      <header className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Icon icon={Zap} size={16} className="text-brand-blue" />
        <p className="text-sm font-bold text-text-primary">
          Live: getting prices for your area
        </p>
      </header>

      <ul className="flex flex-col gap-3 p-[18px]">
        {PREVIEW_MECHANICS.map((m, i) => (
          <li
            key={m.name}
            className={cn(
              "relative flex items-center gap-3 rounded-xl border p-3",
              m.featured
                ? "border-[1.5px] border-brand-blue bg-blue-50"
                : "border-border bg-surface-card",
            )}
          >
            {m.featured && (
              <span className="absolute -top-2 left-3.5 rounded-full bg-brand-blue px-2 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-white">
                Best match
              </span>
            )}
            <Avatar name={m.name} tint={i} size={42} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-text-primary">{m.name}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <Stars value={Math.round(m.rating)} size={10} />
                <span>
                  {m.rating} · {m.jobs} jobs · ETA {m.eta}
                </span>
              </div>
            </div>
            <p className="text-lg font-extrabold tracking-tight text-text-primary">
              {m.price}
            </p>
          </li>
        ))}
      </ul>

      <footer className="flex items-center justify-between border-t border-border bg-surface px-5 py-3 text-[11px] text-text-muted">
        <span>Updated just now</span>
        <a href="#mechanics" className="font-semibold text-brand-blue hover:underline">
          See 8 more →
        </a>
      </footer>
    </Card>
  );
}
