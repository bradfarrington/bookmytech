import { CustomerNav } from "@/components/ui/customer-nav";
import { Compare } from "./_components/compare";
import { Coverage } from "./_components/coverage";
import { Faq } from "./_components/faq";
import { FinalCta } from "./_components/final-cta";
import { Footer } from "./_components/footer";
import { Hero } from "./_components/hero";
import { HowItWorks } from "./_components/how-it-works";
import { MechanicJoin } from "./_components/mechanic-join";
import { QuoteShowcase } from "./_components/quote-showcase";
import { RepairsPreview } from "./_components/repairs-preview";
import { Reviews } from "./_components/reviews";
import { StickyBookBar } from "./_components/sticky-book-bar";
import { TrustTicker } from "./_components/trust-ticker";

// The services section reads the admin's products and the reviews section reads
// `reviews.is_public`. Both revalidate "/" on an admin change straight away
// (app/actions/catalogue-products.ts, app/actions/admin-reviews.ts); this is the
// backstop.
export const revalidate = 3600;

// Section order and layout follow proposal/homepage-redesign.html (Task 46).
export default function HomePage() {
  return (
    <>
      <CustomerNav />
      <main>
        <Hero />
        <TrustTicker />
        <QuoteShowcase />
        <HowItWorks />
        <RepairsPreview />
        <Reviews />
        <MechanicJoin />
        <Compare />
        <Coverage />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <StickyBookBar />
    </>
  );
}
