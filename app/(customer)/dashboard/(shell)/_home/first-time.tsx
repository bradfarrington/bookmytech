import { CarFront, Hash, MapPin, Plus, Wrench } from "lucide-react";
import { ButtonLink, EmptyState, ListCard, ListRow, Section, Tile } from "@/components/dashboard/ui";

// Home before the first booking (mockup 02 "Dashboard · First-time"). The
// mockup's "fixed price, no call-out fee" line and its footer tagline aren't
// claims we can back, so they're left out.
export function FirstTime() {
  return (
    <>
      <EmptyState
        icon={CarFront}
        title="No bookings yet"
        body="Book a vetted mechanic to come to you, at a time that suits."
        action={
          <ButtonLink href="/book" size="lg" full icon={Plus}>
            Book a mechanic
          </ButtonLink>
        }
      />
      <Section title="How it works">
        <ListCard>
          <ListRow
            leading={<Tile icon={Hash} size="sm" />}
            title="1 · Drop in your reg"
            caption="We look your vehicle up for you."
          />
          <ListRow
            leading={<Tile icon={Wrench} size="sm" />}
            title="2 · Pick what needs fixing"
            caption="Prices for your exact car."
          />
          <ListRow
            leading={<Tile icon={MapPin} size="sm" />}
            title="3 · Choose a time and place"
            caption="Home, work, wherever it's parked."
          />
        </ListCard>
      </Section>
    </>
  );
}
