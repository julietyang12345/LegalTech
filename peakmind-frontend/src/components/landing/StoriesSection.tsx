import {
  Activity,
  ArrowUpRight,
  BatteryLow,
  Brain,
  CircleGauge,
  Compass,
  Heart,
  Scale,
  Users,
} from 'lucide-react';

const supportTopics = [
  {
    title: 'Loss of identity',
    icon: Compass,
    copy: 'When your sport is who you are, stepping away feels like losing yourself. You need someone who understands that depth.',
  },
  {
    title: 'Injury recovery',
    icon: Activity,
    copy: 'Physical healing is only part of it. The mental side of coming back is rarely talked about—but it\'s just as crucial.',
  },
  {
    title: 'Performance pressure',
    icon: CircleGauge,
    copy: 'Everyone expects you to perform. But who do you talk to when the pressure becomes too much to carry alone?',
  },
  {
    title: 'Burnout',
    icon: BatteryLow,
    copy: 'The sport you loved now feels like a job. You\'re exhausted but feel guilty for not wanting to push harder.',
  },
  {
    title: 'Stuck in a plateau',
    icon: Scale,
    copy: 'You\'re doing everything right—the training, the routine—but the results still aren\'t showing up like you thought.',
  },
  {
    title: 'Transition out of sports',
    icon: ArrowUpRight,
    copy: 'Moving into "normal life" after years of sport and discipline can feel empty and confusing. You don\'t have to figure it out alone.',
  },
  {
    title: 'Self-doubt & confidence',
    icon: Brain,
    copy: 'You question if you\'re good enough, if you made the right choices, or if you even belong. Let\'s rebuild that belief together.',
  },
  {
    title: 'Relationships & support',
    icon: Users,
    copy: 'It can be hard for others to understand what you\'re going through. We\'ll help you build stronger connections and find your support system.',
  },
];

export function StoriesSection() {
  return (
    <section className="section support-spectrum-section" id="stories">
      <div className="support-spectrum-shell">
        <header className="support-spectrum-header">
          <div className="support-spectrum-kicker">Sound familiar?</div>
          <h2 className="support-spectrum-title">
            Felt any of these?<br />We can <span className="support-spectrum-accent">help.</span>
          </h2>
          <div className="support-spectrum-not-alone">
            <Heart size={13} />
            You're not alone
          </div>
        </header>

        <div className="support-spectrum-grid">
          {supportTopics.map(({ title, icon: Icon, copy }) => (
            <article className="support-spectrum-card" key={title}>
              <span className="support-spectrum-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.8} />
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
