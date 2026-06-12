import type { CSSProperties } from 'react';
import { challengeCards } from '../../services/landingContent';
import { SectionHeading } from './SectionHeading';

export function ChallengeSection() {
  return (
    <section className="section dark-section" id="moments">
      <SectionHeading
        label="The mental side of being an athlete"
        title="The mental side of being an athlete is real."
        copy="Performance pressure does not stay on the field. It follows you into sleep, school, recovery, relationships, and how you see yourself."
        revealTitle={false}
      />
      <div className="moments-board">
        {challengeCards.map((card, index) => (
          <article
            className="moment-note"
            key={card.title}
            style={{ '--delay': `${index * 90}ms` } as CSSProperties}
          >
            <span>quiet thought</span>
            <h3>{card.title}</h3>
            <p>{card.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
