import { ArrowRight } from 'lucide-react';
import { RevealTitle } from './RevealTitle';

export function AlumniSection() {
  return (
    <section className="section alumni-section">
      <div className="alumni-panel">
        <span className="label-pill">Alumni give-back</span>
        <RevealTitle>Help provide private support access for the next generation of athletes.</RevealTitle>
        <p>
          Alumni can sponsor PeakMind access for current athletes at their
          school, including the athlete pressure check, mental side of sport
          resources, and subsidized introductions to athlete-informed support.
        </p>
        <a className="inline-link" href="/pressure-check">
          Sponsor access for athletes <ArrowRight size={17} />
        </a>
      </div>
    </section>
  );
}
