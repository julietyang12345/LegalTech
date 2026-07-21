import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useState } from 'react';

const athleteStatuses = [
  'High school athlete',
  'College athlete',
  'Professional athlete',
  'Former athlete',
  'Recreational/competitive athlete',
];

const competitionLevels = [
  'NCAA Division I',
  'NCAA Division II',
  'NCAA Division III',
  'Professional',
  'Intramural/Club',
  'Other',
];

const relevantExperiences = [
  'Performance anxiety',
  'Confidence issues',
  'Burnout',
  'Stress',
  'Injury recovery',
  'Motivation',
  'Coach-related challenges',
  'Team dynamics',
  'Identity outside sport',
  'Hard-to-control worry, competition pressure, or pre-competition nerves',
  'Low mood, feeling emotionally stuck, loss of motivation',
  'Balancing academics and athletics',
  'Transitioning out of sport',
  'Other',
];

const supportInterests = [
  'Sport psychology',
  'Mental performance coaching',
  'Therapy',
  "Not sure - I'd like guidance",
];

const genderPreferences = [
  'No preference',
  'Woman provider',
  'Man provider',
  'Nonbinary provider',
  'Prefer to discuss',
];

const insuranceOptions = ['Yes', 'No', 'Not sure'];

const referralSources = [
  'Coach or athletic staff',
  'Teammate or friend',
  'Family member',
  'School or university',
  'Social media',
  'Search engine',
  'Provider referral',
  'Other',
];

const stateOptions = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
];

type ChoiceGroupProps = {
  legend: string;
  name: string;
  options: string[];
  type?: 'checkbox' | 'radio';
};

function ChoiceGroup({ legend, name, options, type = 'radio' }: ChoiceGroupProps) {
  return (
    <fieldset className="match-choice-group">
      <legend>{legend}</legend>
      <div>
        {options.map((option) => (
          <label className="match-choice" key={option}>
            <input name={name} type={type} value={option} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PrivateMatchPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="route-shell private-match-shell">
      <nav className="survey-nav">
        <a href="/providers" className="back-link">
          <ArrowLeft size={17} />
          Support options
        </a>
        <div className="survey-nav-actions">
          <a className="nav-pill" href="/provider-filter">
            Browse providers
          </a>
        </div>
      </nav>

      <section className="private-match-hero">
        <span className="label-pill">
          <Sparkles size={15} />
          Private match details
        </span>
        <h1>Tell us what kind of support would fit right now</h1>
        <p>
          Share a little context so PeakMind can help identify a sport-informed
          provider or next step that matches your goals, schedule, and comfort level.
        </p>
      </section>

      <section className="private-match-layout">
        <form
          className="private-match-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <div className="match-form-grid">
            <label className="match-field">
              First name
              <input name="firstName" placeholder="Your first name" required type="text" />
            </label>

            <label className="match-field">
              Age or age range
              <input name="ageRange" placeholder="18, 18-22, 30s..." required type="text" />
            </label>

            <label className="match-field">
              Email
              <input name="email" placeholder="you@example.com" required type="email" />
            </label>

            <label className="match-field">
              State you currently live in
              <select name="state" required defaultValue="">
                <option value="" disabled>
                  Select state
                </option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ChoiceGroup
            legend="Are you currently..."
            name="athleteStatus"
            options={athleteStatuses}
          />

          <label className="match-field match-field-full">
            What sport(s) do you participate in?
            <input name="sports" placeholder="Soccer, track, swimming..." required type="text" />
          </label>

          <ChoiceGroup
            legend="How would you describe your current level of competition?"
            name="competitionLevel"
            options={competitionLevels}
          />

          <ChoiceGroup
            legend="What experience feels most relevant to you now?"
            name="relevantExperience"
            options={relevantExperiences}
            type="checkbox"
          />

          <label className="match-field match-field-full">
            What made you decide to reach out today?
            <textarea
              name="reachOutReason"
              placeholder="A recent performance, a pattern you've noticed, a transition, or anything else that feels important."
              rows={5}
            />
          </label>

          <ChoiceGroup legend="I'm interested in" name="supportInterest" options={supportInterests} />

          <ChoiceGroup
            legend="Provider gender preference"
            name="genderPreference"
            options={genderPreferences}
          />

          <ChoiceGroup
            legend="Are you hoping to use insurance?"
            name="insurance"
            options={insuranceOptions}
          />

          <label className="match-field match-field-full">
            How did you find out about PeakMind?
            <select name="referralSource" required defaultValue="">
              <option value="" disabled>
                Select one
              </option>
              {referralSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>

          <div className="private-match-submit-row">
            {submitted ? (
              <p className="private-match-confirmation">
                <CheckCircle2 size={18} />
                Your details are ready to send.
              </p>
            ) : (
              <p>PeakMind will use this to guide your match, not to judge readiness.</p>
            )}
            <button className="primary-button" type="submit">
              Send match details <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
