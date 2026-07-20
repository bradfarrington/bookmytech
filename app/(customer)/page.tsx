import { Faq } from "./_components/faq";
import { FinalCta } from "./_components/final-cta";
import { Footer } from "./_components/footer";
import { Hero } from "./_components/hero";
import { HowItWorks } from "./_components/how-it-works";
import { Reviews } from "./_components/reviews";
import { RepairsPreview } from "./_components/repairs-preview";
import { TrustStrip } from "./_components/trust-strip";
import { WhyBmt } from "./_components/why-bmt";

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Reviews />
      <RepairsPreview />
      <WhyBmt />
      <Faq />
      <FinalCta />
      <Footer />
    </>
  );
}
