import { EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { RevealTitle } from './RevealTitle';

const privacyPoints = [
  {
    icon: LockKeyhole,
    title: 'Your check-in starts private',
    copy: 'Use PeakMind to name what is going on before you decide whether to share anything with anyone.',
  },
  {
    icon: ShieldCheck,
    title: 'Independent from the team system',
    copy: 'The experience is designed around support outside coaches, roster decisions, and athletic department pressure.',
  },
  {
    icon: EyeOff,
    title: 'No self-diagnosis required',
    copy: 'Start with real athlete moments, then choose tools, stories, or private support based on what fits.',
  },
];

export function PrivacySection() {
  return (
    <section className="section privacy-section" id="privacy">
      <div className="privacy-panel">
        <div className="privacy-copy">
          <span className="label-pill">Private by design</span>
          <RevealTitle>Support should not feel like reporting yourself.</RevealTitle>
          <p>
            PeakMind gives athletes a place to check in, understand what they
            might need, and choose a next step without starting inside the
            school or team system.
          </p>
        </div>
        <div className="privacy-grid">
          {privacyPoints.map((point) => {
            const Icon = point.icon;
            return (
              <article key={point.title}>
                <Icon size={24} />
                <h3>{point.title}</h3>
                <p>{point.copy}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
