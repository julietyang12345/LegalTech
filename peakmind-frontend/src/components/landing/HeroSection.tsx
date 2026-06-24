import {
  ArrowRight,
  LockKeyhole,
} from 'lucide-react';

export function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-video-layer" aria-hidden="true">
        <img src="/images/peakmind-hero-motion-light.png" alt="" />
      </div>

      <div className="motion-field" aria-hidden="true">
        <span className="runner-line line-one" />
        <span className="runner-line line-two" />
        <span className="runner-line line-three" />
        <span className="pulse-orbit orbit-one" />
        <span className="pulse-orbit orbit-two" />
        <span className="energy-dot dot-one" />
        <span className="energy-dot dot-two" />
        <span className="energy-dot dot-three" />
        <span className="energy-dot dot-four" />
        <span className="wave-ring ring-one" />
        <span className="wave-ring ring-two" />
      </div>

      <div className="hero-content" id="top">
        <div className="hero-copy">
          <div className="privacy-badge">
            <LockKeyhole size={20} />
            <span>Independent from your university and athletic department</span>
          </div>
          <h1 className="hero-title">
            <span className="hero-title-main">
              The support your mind needs,
            </span>
            <span className="hero-title-accent">built for athletes</span>
          </h1>
          <p>
            PeakMind helps athletes better understand what they're experiencing
            through an Athlete Insight Check-In and personalized next-step
            guidance. Whether you're navigating burnout, injury, performance
            anxiety, identity challenges, or life transitions, PeakMind helps
            you understand your options and decide what support feels right for
            you.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="/pressure-check">
              Take the Athlete Insight Check <ArrowRight size={18} />
            </a>
            <a className="secondary-button" href="/providers">
              Find Athlete-Specialized Support
            </a>
          </div>
        </div>
      </div>

      <div className="hero-wave-divider" aria-hidden="true">
        <svg viewBox="0 0 1440 64" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,30 C260,18 460,18 700,31 C940,44 1160,45 1440,27 L1440,64 L0,64 Z" />
        </svg>
      </div>
    </section>
  );
}
