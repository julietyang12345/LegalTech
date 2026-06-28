import {
  FaqSection,
  FinalCtaSection,
  HeroSection,
  LandingNavigation,
  PathsSection,
  PrivacySection,
  StoriesSection,
} from '../components/landing';

export function LandingPage() {
  return (
    <main className="site-shell">
      <LandingNavigation />
      <HeroSection />
      <StoriesSection />
      <PrivacySection />
      <PathsSection />
      <FaqSection />
      <FinalCtaSection />
    </main>
  );
}
