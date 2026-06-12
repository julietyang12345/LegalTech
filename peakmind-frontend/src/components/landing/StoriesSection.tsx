import { useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { athleteStories } from '../../services/landingContent';
import { SectionHeading } from './SectionHeading';

const storyRoutes = [
  {
    focus: 'mistake-replay',
    story: athleteStories[1],
    support: 'Support for confidence dips and performance pressure.',
  },
  {
    focus: 'injury-recovery',
    story: athleteStories[0],
    support: 'Support for returning when your body is cleared, but trust is not back.',
  },
  {
    focus: 'private-support',
    story: athleteStories[2],
    support: 'Support outside your coach, roster, school, or athletic department.',
  },
  {
    focus: 'burnout',
    story: athleteStories[3],
    support: 'Support for burnout, numbness, and overload from sport and school.',
  },
];

export function StoriesSection() {
  const railRef = useRef<HTMLDivElement>(null);

  const scrollRail = () => {
    railRef.current?.scrollBy({
      left: Math.max(340, railRef.current.clientWidth * 0.78),
      behavior: 'smooth',
    });
  };

  const scrollRailBack = () => {
    railRef.current?.scrollBy({
      left: -Math.max(340, railRef.current.clientWidth * 0.78),
      behavior: 'smooth',
    });
  };

  return (
    <section className="section stories-section" id="stories">
      <div className="section-heading-row">
        <SectionHeading
          label="Start with what feels closest"
          title="Pick the athlete moment that sounds most like you."
          copy="Choose one entry point. PeakMind will start the pressure check with that context already in mind."
        />
      </div>
      <div className="story-stage">
        <button className="story-arrow story-arrow-edge story-arrow-left" type="button" onClick={scrollRailBack} aria-label="See previous stories">
          <ArrowLeft size={20} />
        </button>
        <div className="story-rail" aria-label="Athlete story routes" ref={railRef}>
          {storyRoutes.map(({ focus, story, support }) => (
            <a
              className="story-card"
              href={`/pressure-check?focus=${focus}`}
              key={focus}
              aria-label={`Start pressure check for ${story.context}`}
            >
              <div className="story-card-media">
                <img src={story.image} alt={story.imageAlt} loading="eager" decoding="async" />
                <span>{story.context}</span>
              </div>
              <div className="story-card-copy">
                <h3>{story.quote}</h3>
                <p>{support}</p>
              </div>
            </a>
          ))}
        </div>
        <button className="story-arrow story-arrow-edge" type="button" onClick={scrollRail} aria-label="See more stories">
          <ArrowRight size={20} />
        </button>
      </div>
    </section>
  );
}
