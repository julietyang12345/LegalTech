import { ArrowLeft, ArrowRight } from 'lucide-react';
import { providerTypes } from '../services/landingContent';

export function ProvidersPage() {
  return (
    <main className="route-shell">
      <nav className="survey-nav">
        <a href="/" className="back-link">
          <ArrowLeft size={17} />
          Back to PeakMind
        </a>
        <div className="survey-nav-actions">
          <a className="nav-pill" href="/pressure-check">
            Start check-in
          </a>
        </div>
      </nav>

      <section className="route-hero">
        <span className="label-pill">Private support options</span>
        <h1>Find support that fits what you are carrying.</h1>
        <p>
          PeakMind helps athletes understand the difference between therapy,
          sports psychology, and performance coaching before choosing a next
          step.
        </p>
      </section>

      <section className="route-card-grid">
        {providerTypes.map((provider) => (
          <article className="route-card" key={provider.title}>
            <h2>{provider.title}</h2>
            <p>{provider.bestFor}</p>
            <span>{provider.note}</span>
          </article>
        ))}
      </section>

      <section className="route-cta-panel">
        <div>
          <span>Not sure which one fits?</span>
          <strong>Start with the pressure check and let PeakMind route you.</strong>
        </div>
        <a className="primary-button" href="/pressure-check">
          Help me choose <ArrowRight size={18} />
        </a>
      </section>
    </main>
  );
}
