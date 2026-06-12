import { Sparkles } from 'lucide-react';
import { socialPrompts } from '../../services/landingContent';
import { RevealTitle } from './RevealTitle';

export function CommunitySection() {
  return (
    <section className="section community-section">
      <div className="community-card">
        <Sparkles size={30} />
        <RevealTitle>You are not the only athlete carrying this.</RevealTitle>
        <p>
          Some athletes ask for help directly. Others need to see someone else
          say it first. PeakMind creates private support pathways, athlete
          stories, and trusted access points before athletes are ready to speak
          up.
        </p>
        <div className="social-lines">
          {socialPrompts.map((prompt) => (
            <span key={prompt}>{prompt}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
