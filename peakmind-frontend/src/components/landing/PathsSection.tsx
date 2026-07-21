import {
  ArrowUpRight,
  LibraryBig,
  MessagesSquare,
} from 'lucide-react';

export function PathsSection() {
  return (
    <section className="section approach-section" id="paths">
      <div className="next-steps-shell">
        <header className="next-steps-heading">
          <span>Our approach</span>
          <h2>Got a feeling, but don&apos;t know where to start?</h2>
          <p>Choose the path that feels most useful right now.</p>
        </header>

        <div className="next-step-grid next-step-grid-two">
          <a className="next-step-card next-step-card-featured" href="/support-options" id="providers">
            <div className="next-step-card-top">
              <span className="next-step-number">01</span>
              <span className="next-step-icon">
                <MessagesSquare size={25} strokeWidth={1.8} />
              </span>
            </div>
            <h3>Talk to someone who gets it</h3>
            <p>
              Find athlete-informed professionals who understand the unique
              pressures, challenges, and realities of competitive sport.
            </p>
            <span className="next-step-link">
              Find support <ArrowUpRight size={18} />
            </span>
          </a>

          <a className="next-step-card" href="/tools">
            <div className="next-step-card-top">
              <span className="next-step-number">02</span>
              <span className="next-step-icon">
                <LibraryBig size={25} strokeWidth={1.8} />
              </span>
            </div>
            <h3>Tools &amp; Resources</h3>
            <p>
              Explore practical articles, guides, and strategies for burnout,
              performance anxiety, injury recovery, identity, and life beyond
              sport.
            </p>
            <span className="next-step-link">
              Explore resources <ArrowUpRight size={18} />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
