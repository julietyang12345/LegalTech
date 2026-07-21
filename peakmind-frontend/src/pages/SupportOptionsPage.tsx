import { ArrowLeft, ArrowRight, ClipboardList, Search } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useState } from 'react';
import { providerTypes } from '../services/landingContent';

export function SupportOptionsPage() {
  const [showProviderOptions, setShowProviderOptions] = useState(false);

  const scrollToProviderOptions = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.history.replaceState(null, '', '#provider-options');
    setShowProviderOptions(true);

    window.requestAnimationFrame(() => {
      document
        .getElementById('provider-options')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

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
        <h1>Find athlete-specific support</h1>
        <p>
          Choose the path that fits your comfort level: browse sport-informed
          providers first, or request a private match when you are ready to
          share more.
        </p>
      </section>

      <section className="support-choice-grid" aria-label="Athlete support paths">
        <a
          className="support-choice-card support-choice-card-featured"
          href="#provider-options"
          onClick={scrollToProviderOptions}
        >
          <span className="support-choice-icon" aria-hidden="true">
            <Search size={24} />
          </span>
          <small>Start by building trust</small>
          <h2>Browse sport-informed providers</h2>
          <p>
            See provider credentials, athlete experience, style, availability,
            and insurance or payment details before sharing personal information.
          </p>
          <strong>
            Browse providers <ArrowRight size={17} />
          </strong>
        </a>

        <a className="support-choice-card" href="/private-match">
          <span className="support-choice-icon" aria-hidden="true">
            <ClipboardList size={24} />
          </span>
          <small>Ready for guidance</small>
          <h2>Request a private match</h2>
          <p>
            Share what is going on privately so PeakMind can help identify a
            sport-informed provider or support path that fits your needs.
          </p>
          <strong>
            Get matched with support <ArrowRight size={17} />
          </strong>
        </a>
      </section>

      {showProviderOptions ? (
        <section className="route-card-grid" id="provider-options" tabIndex={-1}>
          {providerTypes.map((provider) => (
            <article className="route-card" key={provider.title}>
              <h2>{provider.title}</h2>
              <p className="provider-fit">"{provider.fit}"</p>
              <p>{provider.bestFor}</p>
              <span>{provider.note}</span>
              <a className="provider-card-link" href={`/provider-filter?type=${provider.slug}`}>
                View providers <ArrowRight size={16} />
              </a>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
