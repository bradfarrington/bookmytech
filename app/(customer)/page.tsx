import { CustomerNav } from "@/components/ui/customer-nav";
import { Compare } from "./_components/compare";
import { Coverage } from "./_components/coverage";
import { Faq } from "./_components/faq";
import { FinalCta } from "./_components/final-cta";
import { Footer } from "./_components/footer";
import { Hero } from "./_components/hero";
import { HowItWorks } from "./_components/how-it-works";
import { QuoteShowcase } from "./_components/quote-showcase";
import { Reviews } from "./_components/reviews";
import { RepairsPreview } from "./_components/repairs-preview";
import { StickyBookBar } from "./_components/sticky-book-bar";
import { TrustTicker } from "./_components/trust-ticker";

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
