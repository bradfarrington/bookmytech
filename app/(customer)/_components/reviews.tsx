import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { Stars } from "@/components/ui/stars";

type Review = {
  name: string;
  city: string;
  title: string;
  body: string;
  rating: number;
  /** Initials-avatar gradient. */
  avatar: string;
};

const REVIEWS: Review[] = [
  {
    name: "Hannah R.",
    city: "Crystal Palace",
    title: "Booked at 9am, fixed by lunch.",
    body: "Battery died on the school run. Booked on the train, James came to my drive at 11. Properly impressed.",
    rating: 5,
    avatar: "bg-[linear-gradient(135deg,#ec4899,#db2777)]",
  },
  {
    name: "Marcus K.",
    city: "Manchester",
    title: "No more garage waiting rooms.",
    body: "Brake pads done while I was on a Zoom call. £40 cheaper than Kwik Fit and zero faff.",
    rating: 5,
    avatar: "bg-[linear-gradient(135deg,#6366f1,#4f46e5)]",
  },
  {
    name: "Sasha T.",
    city: "Bristol",
    title: "Trustworthy and transparent.",
    body: "Loved seeing the mechanic's reviews and exact price up front. No nasty surprises at the end.",
    rating: 5,
    avatar: "bg-[linear-gradient(135deg,#10b981,#059669)]",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .replace(/[^A-Z]/gi, "")
    .slice(0, 2)
    .toUpperCase();
}

export function Reviews() {
  return (
    <section id="reviews" className="scroll-mt-[68px]">
      <div className="mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-[88px]">
        <SectionHeading
          eyebrow="Reviews"
          title="Drivers across the UK rate us 4.9 out of 5."
          lead="Real bookings, real mechanics, real results — here's what people say after we've been to their door."
        />

        <Reveal as="ul" stagger className="grid gap-5 min-[900px]:grid-cols-3">
          {REVIEWS.map((r) => (
            <li key={r.name}>
              <figure className="flex h-full flex-col gap-3.5 rounded-[20px] border border-border bg-white p-[26px]">
                <Stars value={r.rating} size={14} />
                <blockquote className="flex flex-col gap-3.5">
                  <p className="font-display text-[21px] font-bold leading-[1.25] tracking-[-0.015em] text-text-primary">
                    &ldquo;{r.title}&rdquo;
                  </p>
                  <p className="text-sm leading-[1.55] text-text-secondary">{r.body}</p>
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-3 border-t border-border-subtle pt-3.5">
                  <span
                    aria-hidden
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${r.avatar}`}
                  >
                    {initials(r.name)}
                  </span>
                  <span>
                    <span className="block text-[13px] font-bold text-text-primary">{r.name}</span>
                    <span className="block text-xs text-text-muted">{r.city}</span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
