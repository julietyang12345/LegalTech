import { useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { athleteStories } from '../services/landingContent';

const storyCards = [
  {
    story: athleteStories[1],
    support: 'For the moments when performance starts feeling tied to your worth.',
  },
  {
    story: athleteStories[0],
    support: 'For the comeback that is physical and emotional.',
  },
  {
    story: athleteStories[2],
    support: 'For athletes who need help outside the team system.',
  },
  {
    story: athleteStories[3],
    support: 'For the exhaustion that rest alone does not fix.',
  },
];

export function StoriesPage() {
  const railRef = useRef<HTMLDivElement>(null);

  const scrollRail = (direction: 1 | -1) => {
    railRef.current?.scrollBy({
      left: direction * Math.max(340, railRef.current.clientWidth * 0.78),
      behavior: 'smooth',
    });
  };

  return (
    <main className="route-shell stories-route-shell">
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

      <section className="route-hero stories-route-hero">
        <span className="label-pill">Athlete stories</span>
        <h1>The things athletes do not always say out loud.</h1>
        <p>
          Real athlete moments can sit behind performance, recovery, confidence,
          burnout, and the need for support outside the team system.
        </p>
      </section>

      <section className="story-stage story-route-stage">
        <button
          aria-label="See previous stories"
          className="story-arrow story-arrow-edge story-arrow-left"
          onClick={() => scrollRail(-1)}
          type="button"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="story-rail" aria-label="Athlete story cards" ref={railRef}>
          {storyCards.map(({ story, support }) => (
            <article className="story-card" key={story.context}>
              <div className="story-card-media">
                <img src={story.image} alt={story.imageAlt} loading="eager" decoding="async" />
                <span>{story.context}</span>
              </div>
              <div className="story-card-copy">
                <h3>{story.quote}</h3>
                <p>{support}</p>
              </div>
            </article>
          ))}
        </div>
        <button
          aria-label="See more stories"
          className="story-arrow story-arrow-edge"
          onClick={() => scrollRail(1)}
          type="button"
        >
          <ArrowRight size={20} />
        </button>
      </section>

      <section className="route-cta-panel">
        <div>
          <span>If one of these feels familiar</span>
          <strong>You can start privately before deciding what to share.</strong>
        </div>
        <a className="primary-button" href="/pressure-check">
          Take the pressure check <ArrowRight size={18} />
        </a>
      </section>
    </main>
  );
}
