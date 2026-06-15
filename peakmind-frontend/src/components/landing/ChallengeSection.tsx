import type { CSSProperties } from 'react';
import { challengeCards } from '../../services/landingContent';
import { SectionHeading } from './SectionHeading';

export function ChallengeSection() {
  return (
    <section className="section dark-section" id="moments">
      <SectionHeading
        label="The mental side of sport"
        title="Everyone sees the performance. Not everyone sees the pressure."
        copy="Training, class, travel, recovery, and identity can all get pulled into the same week. This is what the pressure feels like when it follows athletes off the field."
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
