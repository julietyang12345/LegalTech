import {
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RevealTitle } from './RevealTitle';

type TrustCard = {
  number: string;
  title: string;
  copy: string;
  icon: LucideIcon;
};

const trustCards: TrustCard[] = [
  {
    number: '01',
    title: "Built by Someone Who's Been There",
    copy: 'Founded by a former athlete, PeakMind understands competition, expectations, setbacks, and identity beyond sport. It helps athletes navigate experiences that can be difficult to explain outside sport.',
    icon: UserRound,
  },
  {
    number: '02',
    title: 'Independent & Athlete-First',
    copy: 'PeakMind exists outside of university systems and athletic departments. It gives athletes a dedicated place to learn about support options, explore resources, and make informed decisions without added pressure.',
    icon: ShieldCheck,
  },
  {
    number: '03',
    title: 'A Safe, Private Place to Start',
    copy: "Start privately without judgment or stigma. PeakMind helps you understand what you're experiencing and explore support options on your terms.",
    icon: LockKeyhole,
  },
];

const [primaryTrustCard, ...secondaryTrustCards] = trustCards;

export function PrivacySection() {
  const PrimaryIcon = primaryTrustCard.icon;

  return (
    <section className="section privacy-section" id="privacy">
      <div className="privacy-trust-shell">
        <div className="privacy-trust-intro">
          <div className="privacy-trust-kicker">
            <LockKeyhole size={14} />
            Independent. Private. Athlete-first.
          </div>
          <RevealTitle>
            Confidential Support <span>Starts Here</span>
          </RevealTitle>
          <div className="privacy-title-rule" aria-hidden="true" />
          <p>
            Many student-athletes worry about judgment, stigma, or others finding
            out.
          </p>
          <p>
            PeakMind was created to provide a <strong>independent, athlete-focused</strong>{' '}
            space to explore support options and take the next step only if you
            choose to.
          </p>
        </div>

        <div className="privacy-trust-cards">
          <article className="privacy-trust-card privacy-trust-card-primary">
            <div className="privacy-card-topline">
              <span className="privacy-card-icon" aria-hidden="true">
                <PrimaryIcon size={25} strokeWidth={1.8} />
              </span>
              <span className="privacy-card-number">{primaryTrustCard.number}</span>
            </div>
            <div className="privacy-card-rule" aria-hidden="true" />
            <h3>{primaryTrustCard.title}</h3>
            <p>{primaryTrustCard.copy}</p>
          </article>

          {secondaryTrustCards.map(({ number, title, copy, icon: Icon }) => (
            <article className="privacy-trust-card privacy-trust-card-secondary" key={title}>
              <div className="privacy-card-topline">
                <span className="privacy-card-icon" aria-hidden="true">
                  <Icon size={23} strokeWidth={1.8} />
                </span>
                <span className="privacy-card-number">{number}</span>
              </div>
              <div className="privacy-card-rule" aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>

        <div className="privacy-trust-footer">
          <ShieldCheck size={19} />
          <span>
            <strong>Your experience is yours.</strong>
            Start privately and move forward at your own pace.
          </span>
        </div>
      </div>
    </section>
  );
}
