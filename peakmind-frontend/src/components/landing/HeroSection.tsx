import {
  ArrowRight,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';

export function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-video-layer" aria-hidden="true">
        <img src="/images/peakmind-hero-motion.png" alt="" />
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
          <h1 className="hero-title">
            <span className="hero-title-main">
              Private support from people who understand
            </span>
            <span className="hero-title-accent">athlete life</span>
          </h1>
          <p>
            PeakMind helps athletes check in on performance pressure, burnout,
            injury comeback, confidence, identity, and support needs - privately
            and without starting inside the team system.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="/pressure-check">
              Take the 2-minute pressure check <ArrowRight size={18} />
            </a>
            <a className="secondary-button" href="/providers">
              Browse private support
            </a>
          </div>
        </div>

        <div className="locker-visual" aria-label="Private athlete support preview">
          <div className="locker-note locker-note-top">
            <span>after practice</span>
            <strong>I can’t switch off after practice.</strong>
          </div>
          <a className="hero-assessment-card" href="/pressure-check" aria-label="Open pressure check">
            <div className="assessment-card-top">
              <span>
                <Sparkles size={16} />
                Private pressure check
              </span>
              <small>2 min</small>
            </div>
            <h2>What feels hardest right now?</h2>
            <div className="assessment-preview-options">
              <span>One mistake keeps replaying</span>
              <span>I feel burned out</span>
              <span>I’m cleared, but I don’t trust my body</span>
              <span>I need support outside my team</span>
              <span>I don’t know where to start</span>
            </div>
            <div className="assessment-card-footer">
              Start privately <ArrowRight size={17} />
            </div>
          </a>
          <div className="locker-note locker-note-bottom">
            <span>private note</span>
            <strong>I need help, but not through my coach.</strong>
          </div>
          <div className="privacy-token">
            <LockKeyhole size={15} />
            independent support path
          </div>
          <div className="thought-rail" aria-hidden="true">
            <div>
              <span>Everyone sees the performance. Not everyone sees the pressure.</span>
              <span>One mistake keeps replaying.</span>
              <span>I wanted support, but not through my coach.</span>
              <span>I’m tired in a way sleep does not fix.</span>
              <span>Everyone sees the performance. Not everyone sees the pressure.</span>
              <span>One mistake keeps replaying.</span>
              <span>I wanted support, but not through my coach.</span>
              <span>I’m tired in a way sleep does not fix.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
