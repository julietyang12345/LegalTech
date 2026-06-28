import { useState } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';

const questions = [
  {
    id: 'mistake_worry',
    prompt: 'How often do you worry about making mistakes in competition or practice?',
    options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Almost always'],
  },
  {
    id: 'poor_performance_duration',
    prompt: 'When you have a poor performance, how long does it typically affect you?',
    options: ['A few minutes', 'A few hours', 'A day', 'Several days', 'A week or more'],
  },
  {
    id: 'confidence_dependency',
    prompt: 'How much does your confidence depend on your athletic performance?',
    options: ['Not at all', 'A little', 'Somewhat', 'A lot', 'Almost entirely'],
  },
];

const result = {
  title: 'The Performer Under Pressure',
  copy:
    'Your responses suggest that performance pressure, fear of mistakes, or comparison with others may be taking up significant mental space. You may hold high expectations for yourself, and at times feel the weight of needing to perform perfectly. Many athletes who are deeply committed to their sport experience this - and it is something you do not have to navigate alone.',
  steps: [
    'Mental performance coaching / train your mental game: confidence, focus, preparation',
    'Confidence resources',
    'Talk it through with a therapist or sports psychologist if pressure feels overwhelming or affects your wellbeing',
    'Read athlete stories about performance pressure',
    'Explore providers who understand athlete pressure',
  ],
};

type Answers = Record<string, string>;

export function PressureCheckPage() {
  const [answers, setAnswers] = useState<Answers>({});
  const [showResult, setShowResult] = useState(false);

  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const isComplete = answeredCount === questions.length;

  const selectAnswer = (questionId: string, option: string) => {
    setAnswers((current) => ({ ...current, [questionId]: option }));
  };

  if (showResult) {
    return (
      <main className="survey-shell">
        <div className="survey-motion" aria-hidden="true">
          <span className="survey-glow survey-glow-one" />
          <span className="survey-glow survey-glow-two" />
          <span className="survey-beam survey-beam-one" />
          <span className="survey-beam survey-beam-two" />
        </div>

        <header className="survey-nav">
          <a href="/" className="back-link">
            <ArrowLeft size={17} />
            Back to PeakMind
          </a>
          <div className="survey-nav-actions">
            <div className="survey-privacy">
              <LockKeyhole size={16} />
              Private result
            </div>
          </div>
        </header>

        <section className="recommendation-panel" id="results">
          <div className="recommendation-kicker">
            <ShieldCheck size={16} />
            Your private recommendation
          </div>
          <h1>{result.title}</h1>
          <p>{result.copy}</p>

          <div className="recommendation-answers" aria-label="Your answers">
            {questions.map((question, index) => (
              <div key={question.id}>
                <span>0{index + 1}</span>
                <strong>{answers[question.id]}</strong>
                <small>{question.prompt}</small>
              </div>
            ))}
          </div>

          <div className="recommendation-next-steps">
            <h2>Possible next steps</h2>
            <div>
              {result.steps.map((step) => (
                <a href="/tools" key={step}>
                  {step}
                  <ArrowRight size={16} />
                </a>
              ))}
            </div>
          </div>

          <footer className="recommendation-actions">
            <button className="secondary-button" type="button" onClick={() => setShowResult(false)}>
              Edit answers
            </button>
            <a className="primary-button" href="/providers">
              Browse private support <ArrowRight size={18} />
            </a>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="survey-shell">
      <div className="survey-motion" aria-hidden="true">
        <span className="survey-glow survey-glow-one" />
        <span className="survey-glow survey-glow-two" />
        <span className="survey-beam survey-beam-one" />
        <span className="survey-beam survey-beam-two" />
      </div>

      <header className="survey-nav">
        <a href="/" className="back-link">
          <ArrowLeft size={17} />
          Back to PeakMind
        </a>
        <div className="survey-nav-actions">
          <div className="survey-privacy">
            <LockKeyhole size={16} />
            Private check-in
          </div>
        </div>
      </header>

      <section className="survey-hero">
        <div>
          <span className="label-pill">
            <ShieldCheck size={16} />
            2-minute athlete pressure check
          </span>
          <h1>Start with three private questions.</h1>
          <p>
            This is not a diagnosis. PeakMind uses your answers to guide you
            toward support options, tools, and resources that may fit what you
            are carrying.
          </p>
        </div>
        <aside className="survey-status-card">
          <LockKeyhole size={22} />
          <strong>Your answers stay private</strong>
          <span>{answeredCount} of {questions.length} answered</span>
          <small>Result preview: private support route</small>
        </aside>
      </section>

      <section className="survey-panel" aria-label="Pressure check form">
        <div className="survey-progress">
          <span style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>

        {questions.map((question, questionIndex) => (
          <div className="survey-step" key={question.id}>
            <div className="survey-step-heading">
              <span>0{questionIndex + 1}</span>
              <h2>{question.prompt}</h2>
            </div>
            <div className="answer-scale">
              {question.options.map((option) => (
                <button
                  className={answers[question.id] === option ? 'answer-choice is-active' : 'answer-choice'}
                  key={option}
                  type="button"
                  onClick={() => selectAnswer(question.id, option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ))}

        <footer className="survey-result">
          <div>
            <span>Your result</span>
            <strong>The Performer Under Pressure</strong>
            <small>
              Complete the three questions to unlock the recommendation page.
            </small>
          </div>
          <button
            className="primary-button"
            disabled={!isComplete}
            type="button"
            onClick={() => setShowResult(true)}
          >
            See my recommendation <ArrowRight size={18} />
          </button>
        </footer>
      </section>
    </main>
  );
}
