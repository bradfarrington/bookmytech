// One heading treatment for every dashboard section, so "Upcoming bookings",
// "Past jobs", "Your vehicles" and the rest read as siblings rather than as
// four slightly different labels.
//
// The count matters more than it looks: the sections stack, and on a busy
// account the only way to tell at a glance whether you have one upcoming job or
// six was to scroll and count the cards.
export function SectionHeading({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text-muted">
      {children}
      {count != null && count > 0 && (
        <span className="rounded-full bg-border-subtle px-2 py-0.5 text-[11px] font-bold leading-relaxed text-text-secondary">
          {count}
        </span>
      )}
    </h2>
  );
}
