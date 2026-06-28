import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqItems = [
  {
    question: 'What is PeakMind?',
    answer:
      'PeakMind helps athletes better understand what they’re experiencing through an Athlete Insight Check-In and personalized next-step guidance. Whether you’re navigating burnout, injury, performance anxiety, identity challenges, or life transitions, PeakMind helps you understand your options and decide what support feels right for you.',
    detail:
      'If you’d like additional support, PeakMind can help connect you with athlete-informed professionals who understand the unique demands of sport - in a private, independent space outside your team or school system. There’s no pressure to take any specific next step; you stay in control of what comes next.',
  },
  {
    question: 'Will my coach, team, or athletic department see my information?',
    answer:
      'No. Your information is private and is not shared with coaches, teammates, or athletic departments without your permission.',
  },
  {
    question: "What if I'm not sure whether I need support?",
    answer:
      "That’s exactly why PeakMind exists. Many athletes struggle to know whether what they’re experiencing is burnout, performance anxiety, stress, identity challenges, or something else. The Athlete Insight Check-In can help you gain clarity and identify potential next steps.",
  },
  {
    question: 'Do I need to be struggling to use PeakMind?',
    answer:
      'Not at all. PeakMind is designed for athletes at every stage of their journey - from those looking to improve their mental performance to those navigating more significant challenges such as injury, burnout, or life transitions.',
  },
  {
    question: 'What makes PeakMind different?',
    answer:
      'Athletes face unique pressures that many people don’t fully understand. PeakMind is built specifically for athletes and focuses on the realities of competition, performance, injury, identity, and life beyond sport.',
  },
  {
    question: 'How much does it cost?',
    answer:
      'Taking the Athlete Insight Check-In and accessing resources is free. Costs for professional support may vary depending on the provider, your insurance coverage, and the services you choose.',
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section faq-section" id="faq">
      <div className="faq-shell">
        <header className="faq-heading">
          <span>FAQ</span>
          <h2>Common questions</h2>
        </header>

        <div className="faq-list">
          {faqItems.map(({ question, answer, detail }, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index}`;

            return (
              <article className={`faq-item${isOpen ? ' is-open' : ''}`} key={question}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                  >
                    <span>{question}</span>
                    <ChevronDown aria-hidden="true" size={25} strokeWidth={2.2} />
                  </button>
                </h3>
                <div className="faq-answer-wrap" id={answerId}>
                  <div>
                    <p>{answer}</p>
                    {detail ? <p>{detail}</p> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
