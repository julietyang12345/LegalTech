import {
  ArrowRight,
  LockKeyhole,
  ShieldCheck,
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
          <div className="eyebrow">
            <ShieldCheck size={18} />
            Independent from your university and athletic department
          </div>
          <h1 className="hero-title">
            <span className="hero-title-main">
              A private space for the mental side of sport.
            </span>
          </h1>
          <p>
            Check in on pressure, confidence, burnout, injury recovery, or
            anything you do not want routed through your team.
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
            <strong>I can’t switch off.</strong>
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
              <span>I need support outside my team</span>
            </div>
            <div className="assessment-card-footer">
              Start privately <ArrowRight size={17} />
            </div>
          </a>
          <div className="locker-note locker-note-bottom">
            <span>private note</span>
            <strong>Don’t send this to my coach.</strong>
          </div>
          <div className="privacy-token">
            <LockKeyhole size={15} />
            independent support path
          </div>
          <div className="thought-rail" aria-hidden="true">
            <div>
              <span>I’m cleared, but I don’t trust my body yet.</span>
              <span>One mistake should not feel this heavy.</span>
              <span>I need help, but not through my team.</span>
              <span>I’m tired in a way sleep does not fix.</span>
              <span>I’m cleared, but I don’t trust my body yet.</span>
              <span>One mistake should not feel this heavy.</span>
              <span>I need help, but not through my team.</span>
              <span>I’m tired in a way sleep does not fix.</span>
            </div>
          </div>
        </div>

        <div className="trust-strip">
          <div>
            <LockKeyhole size={18} />
            Private by design
          </div>
        </div>
      </div>
    </section>
  );
}
