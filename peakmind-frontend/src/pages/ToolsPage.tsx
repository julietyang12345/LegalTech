import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ThemeToggleButton } from '../components/common/ThemeToggleButton';
import { resources } from '../services/landingContent';

export function ToolsPage() {
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
          <ThemeToggleButton />
        </div>
      </nav>

      <section className="route-hero">
        <span className="label-pill">Self-guided tools</span>
        <h1>Short resets for the moments pressure actually shows up.</h1>
        <p>
          Use athlete-specific tools before practice, after mistakes, during
          injury recovery, or when your mind will not slow down.
        </p>
      </section>

      <section className="route-card-grid">
        {resources.map((resource) => {
          const Icon = resource.icon;
          return (
            <article className="route-card" key={resource.title}>
              <div className="icon-tile">
                <Icon size={26} />
              </div>
              <h2>{resource.title}</h2>
              <p>{resource.copy}</p>
            </article>
          );
        })}
      </section>

      <section className="route-cta-panel">
        <div>
          <span>Want a more personal first step?</span>
          <strong>Take the private check-in and get a route based on your moment.</strong>
        </div>
        <a className="primary-button" href="/pressure-check">
          Build my route <ArrowRight size={18} />
        </a>
      </section>
    </main>
  );
}
