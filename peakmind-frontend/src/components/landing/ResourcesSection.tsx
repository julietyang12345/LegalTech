import { resources } from '../../services/landingContent';
import { SectionHeading } from './SectionHeading';
import { ArrowRight } from 'lucide-react';

export function ResourcesSection() {
  return (
    <section className="section resources-section" id="tools">
      <SectionHeading
        label="Self-guided tools"
        title="Support between sessions - or before you are ready for one."
        copy="Short, athlete-specific tools for the moments pressure actually shows up: before a game, after a mistake, during injury recovery, or when sleep is hard."
      />
      <div className="resource-grid">
        {resources.map((resource) => {
          const Icon = resource.icon;
          return (
            <article className="resource-card" key={resource.title}>
              <div className="icon-tile">
                <Icon size={28} />
              </div>
              <h3>{resource.title}</h3>
              <p>{resource.copy}</p>
            </article>
          );
        })}
      </div>
      <div className="section-link-row">
        <a href="/tools" className="inline-link">
          Browse self-guided tools <ArrowRight size={17} />
        </a>
      </div>
    </section>
  );
}
