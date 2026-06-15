import { ArrowRight, Calendar, UserRoundCheck, Zap } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

export function PathsSection() {
  return (
    <section className="section approach-section" id="paths">
      <SectionHeading
        label="Athlete-first navigation"
        title="Start with the kind of support you actually need."
      />
      <div className="support-route">
        <article className="route-stop route-stop-featured" id="start">
          <div className="path-icon">
            <UserRoundCheck size={28} />
          </div>
          <div className="route-stop-copy">
            <div className="path-number">Check-in</div>
            <h3>What feels hardest right now?</h3>
            <p>
              Start with one answer. PeakMind can point you toward a private
              next step without making you name it perfectly first.
            </p>
            <div className="moment-grid route-quick-picks" aria-label="Quick check-in prompts">
              <span className="moment-chip is-active">Pressure to perform</span>
              <span className="moment-chip">Burnout</span>
              <span className="moment-chip">Coming back from injury</span>
              <span className="moment-chip">I need support outside my team</span>
            </div>
            <a href="/pressure-check" className="inline-link">
              Start the pressure check <ArrowRight size={17} />
            </a>
          </div>
        </article>
        <article className="route-stop" id="providers">
          <div className="path-icon">
            <Zap size={28} />
          </div>
          <div className="route-stop-copy">
            <div className="path-number">Providers</div>
            <h3>Need someone who gets it?</h3>
            <p>
              Browse athlete-informed therapists, sports psychologists, or
              performance coaches when you know you need support, but not what
              type yet.
            </p>
            <a href="/providers" className="inline-link">
              Find my match <ArrowRight size={17} />
            </a>
          </div>
        </article>
        <article className="route-stop">
          <div className="path-icon">
            <Calendar size={28} />
          </div>
          <div className="route-stop-copy">
            <div className="path-number">Tools</div>
            <h3>Want tools and tips?</h3>
            <p>
              Access short resources for the moments pressure actually shows up:
              before practice, after a mistake, in recovery, or before sleep.
            </p>
            <a href="/tools" className="inline-link">
              Browse tools <ArrowRight size={17} />
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
