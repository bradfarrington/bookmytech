import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Stars } from "@/components/ui/stars";
import { Reveal } from "@/components/ui/reveal";

type Review = {
  name: string;
  city: string;
  title: string;
  body: string;
  rating: number;
};

const REVIEWS: Review[] = [
  {
    name: "Hannah R.",
    city: "Crystal Palace",
    title: "Booked at 9am, fixed by lunch.",
    body: "Battery died on the school run. Booked on the train, James came to my drive at 11. Properly impressed.",
    rating: 5,
  },
  {
    name: "Marcus K.",
    city: "Manchester",
    title: "No more garage waiting rooms.",
    body: "Brake pads done while I was on a Zoom call. £40 cheaper than Kwik Fit and zero faff.",
    rating: 5,
  },
  {
    name: "Sasha T.",
    city: "Bristol",
    title: "Trustworthy and transparent.",
    body: "Loved seeing the mechanic's reviews and exact price up front. No nasty surprises at the end.",
    rating: 5,
  },
];

export function Reviews() {
  return (
    <section id="reviews" className="mx-auto max-w-content px-4 pb-14 sm:px-8 lg:pb-[56px]">
      <Reveal as="ul" stagger className="grid gap-4 lg:grid-cols-3">
        {REVIEWS.map((r, i) => (
          <li key={r.name}>
            <Card className="flex h-full flex-col">
              <Stars value={r.rating} size={14} />
              <p className="mb-2 mt-2.5 text-base font-bold tracking-[-0.01em] text-text-primary">
                &ldquo;{r.title}&rdquo;
              </p>
              <p className="mb-3.5 text-[13px] leading-[1.5] text-text-secondary">
                {r.body}
              </p>
              <div className="mt-auto flex items-center gap-2.5 border-t border-border-subtle pt-2.5">
                <Avatar name={r.name} tint={i + 1} size={32} />
                <div>
                  <p className="text-xs font-semibold text-text-primary">{r.name}</p>
                  <p className="text-[11px] text-text-muted">{r.city}</p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </Reveal>
    </section>
  );
}
