import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';

const joinSupportTypes = [
  'Therapy',
  'Sport psychology',
  'Mental performance consulting',
  'Assessment',
  'Team workshops',
  'Consultation / referral only',
];

export function ProviderJoinPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="route-shell private-match-shell provider-join-shell">
      <nav className="survey-nav">
        <a href="/for-providers" className="back-link">
          <ArrowLeft size={17} />
          Provider benefits
        </a>
        <div className="survey-nav-actions">
          <a className="nav-pill" href="/provider-filter">
            See directory
          </a>
        </div>
      </nav>

      <section className="private-match-hero provider-join-hero">
        <span className="label-pill">
          <ClipboardCheck size={15} />
          Request to join
        </span>
        <h1>Tell us how athletes should understand your fit</h1>
        <p>
          Share the details athletes and referrers need to evaluate your sport
          experience, credentials, confidentiality approach, and type of support.
        </p>
      </section>

      <section className="private-match-layout provider-join-layout">
        <aside className="private-match-aside provider-join-aside">
          <div>
            <ClipboardCheck size={21} />
            <span>Profile review</span>
          </div>
          <p>
            This request is reviewed before any provider profile is published.
            The goal is to make athlete fit clear before a first call.
          </p>
        </aside>

        <form
          className="private-match-form provider-join-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <div className="match-form-grid">
            <label className="match-field">
              Full name
              <input name="name" placeholder="Your name" required type="text" />
            </label>
            <label className="match-field">
              Email
              <input name="email" placeholder="you@example.com" required type="email" />
            </label>
            <label className="match-field">
              Practice or organization
              <input name="practice" placeholder="Practice, clinic, or organization" type="text" />
            </label>
            <label className="match-field">
              Licensed state(s)
              <input name="states" placeholder="CA, NY, telehealth states..." required type="text" />
            </label>
          </div>

          <label className="match-field match-field-full">
            Provider's sport experience
            <textarea
              name="sportExperience"
              placeholder="Sports, levels, teams, roles, years embedded in sport, or athlete populations served."
              required
              rows={4}
            />
          </label>

          <div className="match-form-grid">
            <label className="match-field">
              Clinical credentials
              <input
                name="credentials"
                placeholder="PhD, PsyD, LCSW, LPC, CMPC..."
                required
                type="text"
              />
            </label>
            <label className="match-field">
              Performance training
              <input
                name="performanceTraining"
                placeholder="CMPC, sport psych training, certifications..."
                type="text"
              />
            </label>
          </div>

          <label className="match-field match-field-full">
            Populations you've worked with
            <textarea
              name="populations"
              placeholder="College athletes, elite youth, professional athletes, injured athletes, retired athletes, specific sports..."
              required
              rows={4}
            />
          </label>

          <label className="match-field match-field-full">
            Approach to confidentiality
            <textarea
              name="confidentiality"
              placeholder="How you explain privacy, communication with teams or families, and limits of confidentiality."
              required
              rows={4}
            />
          </label>

          <fieldset className="match-choice-group">
            <legend>Support offered</legend>
            <div>
              {joinSupportTypes.map((type) => (
                <label className="match-choice" key={type}>
                  <input name="supportTypes" type="checkbox" value={type} />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="match-field match-field-full">
            Anything else athletes should know?
            <textarea
              name="notes"
              placeholder="Insurance, private pay, consultation availability, languages, or who is and is not a fit."
              rows={4}
            />
          </label>

          <div className="private-match-submit-row">
            {submitted ? (
              <p className="private-match-confirmation">
                <CheckCircle2 size={18} />
                Your provider request is ready to send.
              </p>
            ) : (
              <p>Submissions will be reviewed before any provider profile is published.</p>
            )}
            <button className="primary-button" type="submit">
              Request to join <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
