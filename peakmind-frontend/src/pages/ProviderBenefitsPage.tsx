import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Handshake,
  SearchCheck,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';

const providerBenefits = [
  {
    icon: SearchCheck,
    title: 'Receive more informed athlete referrals',
    copy: 'PeakMind helps athletes clarify what they are looking for before they reach out, so provider inquiries start with better context.',
  },
  {
    icon: BadgeCheck,
    title: 'Show what makes your practice athlete-specific',
    copy: 'Your profile can highlight sport experience, credentials, performance training, populations served, confidentiality approach, and type of support.',
  },
  {
    icon: Handshake,
    title: 'Answer fit questions before the first call',
    copy: 'Make it clear who you work best with, which sports or levels you understand, and how your approach supports athletes.',
  },
  {
    icon: ClipboardCheck,
    title: 'Join a more intentional referral pathway',
    copy: 'PeakMind is designed around provider vetting, athlete education, and clearer pathways instead of broad directory listings.',
  },
];

export function ProviderBenefitsPage() {
  return (
    <main className="route-shell provider-benefits-shell">
      <nav className="survey-nav">
        <a href="/" className="back-link">
          <ArrowLeft size={17} />
          Back to PeakMind
        </a>
        <div className="survey-nav-actions">
          <a className="nav-pill" href="/providers">
            Athlete support options
          </a>
        </div>
      </nav>

      <section className="provider-benefits-hero">
        <div>
          <span className="label-pill">
            <UserRoundCheck size={15} />
            For providers
          </span>
          <h1>Grow your athlete-focused practice with better-fit referrals</h1>
          <p>
            PeakMind helps qualified providers show their sport experience,
            clinical credentials, performance training, and approach to
            confidentiality so athletes and referral partners can understand fit
            before the first call.
          </p>
          <div className="provider-benefits-actions">
            <a className="primary-button" href="/provider-join">
              Request to join <ArrowRight size={18} />
            </a>
            <a className="secondary-button" href="/provider-filter">
              See provider directory
            </a>
          </div>
        </div>

        <aside className="provider-trust-panel" aria-label="Provider platform priorities">
          <div>
            <ShieldCheck size={22} />
            <span>Built for qualified provider visibility</span>
          </div>
          <p>
            Present the details that matter most in athlete referrals: who you
            serve, how you work, what credentials you hold, and whether you
            provide therapy, mental performance support, or both.
          </p>
        </aside>
      </section>

      <section className="provider-benefits-grid" aria-label="Provider benefits">
        {providerBenefits.map((benefit) => {
          const Icon = benefit.icon;

          return (
            <article className="provider-benefit-card" key={benefit.title}>
              <span>
                <Icon size={22} />
              </span>
              <h2>{benefit.title}</h2>
              <p>{benefit.copy}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
