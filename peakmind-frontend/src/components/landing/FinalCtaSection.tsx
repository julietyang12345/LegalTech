import { ArrowRight, Zap } from 'lucide-react';
import { RevealTitle } from './RevealTitle';

export function FinalCtaSection() {
  return (
    <section className="final-cta">
      <Zap size={28} />
      <RevealTitle>Support that belongs to you - not your team, coach, or school.</RevealTitle>
      <p>
        Private mental performance and wellbeing support, independent from your
        athletic department.
      </p>
      <a className="primary-button" href="/pressure-check">
        Check my athlete pressure level <ArrowRight size={18} />
      </a>
    </section>
  );
}
