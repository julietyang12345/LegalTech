import {
  Activity,
  ArrowUpRight,
  BatteryLow,
  Brain,
  Fence,
  Users,
} from 'lucide-react';

const supportTopics = [
  {
    title: 'Injury Recovery',
    icon: Activity,
    copy: 'Injury can bring frustration, isolation, fear about the future, and uncertainty. The mental side of recovery is often overlooked, but building confidence, resilience, and trust in your body again is just as important as healing physically.',
  },
  {
    title: 'Burnout',
    icon: BatteryLow,
    copy: 'When the demands of your sport start outweighing the joy, burnout can take hold - you may feel exhausted, unmotivated, emotionally drained or disconnected from a sport you once loved. Burnout is common among athletes, but it\'s often misunderstood or ignored.',
  },
  {
    title: 'Balancing Sport & Life',
    icon: Users,
    copy: 'Being an athlete often means juggling competing demands every day and it can feel impossible to keep up. Finding balance isn\'t about doing more, it\'s about learning how to manage expectations, protect your wellbeing and make space for life beyond your sport.',
  },
  {
    title: 'Stuck in a Plateau',
    icon: Fence,
    copy: 'You\'re doing everything right, but the results aren\'t showing up like you thought they would. When progress stalls, it\'s easy to question yourself. Sometimes the challenge isn\'t physical - it\'s navigating frustration, self-doubt, and mental fatigue that comes with feeling stuck.',
  },
  {
    title: 'Performance & Pressure',
    icon: Brain,
    copy: 'Pressure is part of being an athlete, but when it becomes overwhelming, it can affect your performance. Overthinking, fear of failure, perfectionism, or feeling like you constantly have to prove yourself is common among athletes.',
  },
  {
    title: 'Transition Out of Sports',
    icon: ArrowUpRight,
    copy: 'When your life revolved around sports, as that chapter ends, it\'s normal to feel lost or unsure of who you are. Life after sports is an emotional journey, but you can build a new sense of identity, purpose and direction for what comes next.',
  },
];

export function StoriesSection() {
  return (
    <section className="section support-spectrum-section" id="stories">
      <div className="support-spectrum-shell">
        <header className="support-spectrum-header">
          <h2 className="support-spectrum-title">
            Sound <span className="support-spectrum-accent">Familiar?</span>
          </h2>
        </header>

        <div className="support-spectrum-grid">
          {supportTopics.map(({ title, icon: Icon, copy }) => (
            <article className="support-spectrum-card" key={title}>
              <span className="support-spectrum-icon" aria-hidden="true">
                <Icon size={23} strokeWidth={1.8} />
              </span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>

        <div className="support-spectrum-footer">
          <span>These experiences can overlap. You do not need a label to ask for support.</span>
          <a href="/pressure-check">
            Find your next step <ArrowUpRight size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}
