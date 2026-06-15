import { LockKeyhole } from 'lucide-react';
import { RevealTitle } from './RevealTitle';

const privacyPoints = [
  {
    step: '01',
    visual: 'door',
    title: 'Start with what athlete life feels like',
    copy: 'Name the pressure, confidence hit, injury worry, burnout, or team dynamic before deciding what to do next.',
  },
  {
    step: '02',
    visual: 'shield',
    title: 'Outside the team system',
    copy: 'For when you want support without starting with your coach, roster, school, or athletic department.',
  },
];

export function PrivacySection() {
  return (
    <section className="section privacy-section" id="privacy">
      <div className="privacy-panel">
        <div className="privacy-copy">
          <span className="label-pill">Private by design</span>
          <RevealTitle>
            Support should not feel like{' '}
            <span className="privacy-title-accent">reporting yourself</span>
          </RevealTitle>
          <p>
            Start privately before deciding what, when, or whether to share.
            PeakMind gives athletes a private place to check in, understand
            what they might need, and choose a next step without starting
            inside the school or team system.
          </p>
          <div className="privacy-proof">
            <LockKeyhole size={16} />
            <span>Private. Independent. No pressure.</span>
          </div>
        </div>
        <div className="privacy-grid">
          {privacyPoints.map((point) => (
            <article key={point.title}>
              <span className="privacy-step">{point.step}</span>
              <div
                aria-hidden="true"
                className={`privacy-hero-visual privacy-hero-visual-${point.visual}`}
              >
                <span />
              </div>
              <div>
                <h3>{point.title}</h3>
                <p>{point.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
