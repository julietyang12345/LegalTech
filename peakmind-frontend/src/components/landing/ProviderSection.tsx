import { ArrowRight } from 'lucide-react';
import { providerTypes } from '../../services/landingContent';
import { RevealTitle } from './RevealTitle';

export function ProviderSection() {
  return (
    <section className="section provider-section" id="provider-types">
      <div className="provider-copy">
        <span className="label-pill">Clear support choices</span>
        <RevealTitle>
          Not sure what kind of support fits? Start here.
        </RevealTitle>
        <p>
          Athletes should not have to self-diagnose or guess at the provider
          landscape before asking for help. PeakMind explains the differences,
          including insurance and price expectations, then helps athletes
          choose.
        </p>
        <a href="/pressure-check" className="inline-link">
          Help me choose the right support <ArrowRight size={17} />
        </a>
      </div>
      <div className="provider-comparison">
        {providerTypes.map((item) => (
          <article key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.bestFor}</p>
            <span>{item.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
