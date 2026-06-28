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
    title: 'Performance Anxiety',
    icon: Brain,
    copy: 'Fear of making mistakes, overthinking, loss of confidence or difficulty performing under pressure can make competition feel overwhelming. Performance anxiety affects athletes at every level.',
  },
  {
    title: 'Pressure & Expectations',
    icon: CircleGauge,
    copy: 'Whether the pressure comes from others or from the standards you set for yourself, constantly feeling like you have to prove your worth can be exhausting, impacting confidence, enjoyment, relationships, and mental wellbeing. There are ways to navigate the pressure while protecting your wellbeing.',
  },
  {
    title: 'Stuck in a Plateau',
    icon: Scale,
    copy: 'You\'re doing everything right, but the results still aren\'t showing up like you thought they would. When progress stalls, it\'s easy to question yourself or lose confidence. Sometimes the challenge isn\'t physical - it\'s navigating the frustration, self-doubt, and mental fatigue that come with feeling stuck.',
  },
  {
    title: 'Loss of Identity',
    icon: Compass,
    copy: 'When your sport becomes a central part of who you are, challenges on the field can start to feel personal, leaving you feeling disconnected from yourself. Rebuilding confidence and discovering your identity beyond performance can be difficult, but it\'s a journey you don\'t have to navigate alone.',
  },
  {
    title: 'Balancing Sport & Life',
    icon: Users,
    copy: 'Being an athlete often means juggling competing demands every day and it can feel impossible to keep up. Finding balance isn\'t about doing more, it\'s about learning how to manage expectations, protect your wellbeing and make space for life beyond your sport.',
  },
  {
    title: 'Transition Out of Sports',
    icon: ArrowUpRight,
    copy: 'For years, your schedule, goals, relationships, and purpose may have revolved around your sport. When that chapter ends, it\'s normal to feel lost or unsure of who you are without it. Transitioning out of sport is an emotional journey, but you can build a new sense of identity, purpose and direction for what comes next.',
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
