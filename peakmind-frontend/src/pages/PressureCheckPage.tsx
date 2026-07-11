import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Info, LockKeyhole, ShieldCheck } from 'lucide-react';

type QuestionKind = 'single' | 'multi';

type Question = {
  id: string;
  prompt: string;
  options: string[];
  kind?: QuestionKind;
  maxSelections?: number;
  helper?: string;
  branch?: 'injury';
};

const questions: Question[] = [
  {
    id: 'mistake_worry',
    prompt: 'How often do you worry about making mistakes in competition or practice?',
    options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Almost always'],
  },
  {
    id: 'sport_excitement',
    prompt: 'How excited do you feel about your sport right now?',
    options: [
      'Extremely excited',
      'Mostly excited',
      'Neutral',
      'Somewhat disconnected',
      'Completely burned out',
    ],
  },
  {
    id: 'athlete_identity',
    prompt: 'How much of your identity is tied to being an athlete?',
    options: ['Less than 25%', '25-50%', '50-75%', '75-90%', 'More than 90%'],
  },
  {
    id: 'support_considered',
    prompt: 'Have you ever considered seeking mental health or performance support?',
    options: [
      'Worked with a professional',
      'Considered it seriously, but did not go through with it',
      'Thought about it briefly, but decided not to',
      'Sought information, but did not progress beyond that',
      'No',
    ],
  },
  {
    id: 'poor_performance_duration',
    prompt: 'When you have a poor performance, how long does it typically affect you?',
    options: ['A few minutes', 'A few hours', 'A day', 'Several days', 'A week or more'],
  },
  {
    id: 'identity_after_sport',
    prompt:
      'If you could no longer compete tomorrow, how confident are you that you would still know who you are outside of sport?',
    options: [
      'Extremely confident',
      'Mostly confident',
      'Somewhat confident',
      'Not very confident',
      'Not confident at all',
    ],
  },
  {
    id: 'support_barriers',
    prompt: "If you haven't sought support, what's the biggest reason?",
    helper: 'Choose up to 2.',
    kind: 'multi',
    maxSelections: 2,
    options: [
      "I don't think my problems are serious enough",
      "I don't know where to start",
      'Lack of time',
      'Cost',
      'Insurance concerns',
      'Privacy/confidentiality concerns',
      'Stigma',
      'I prefer handling things myself',
      "I don't trust available resources",
      'Other',
    ],
  },
  {
    id: 'sport_disconnect',
    prompt:
      'Have you started feeling disconnected from your sport, like you are just going through the motions or questioning whether it is still worth it?',
    options: ['Not at all', 'A little', 'Sometimes', 'Often', 'Almost constantly'],
  },
  {
    id: 'current_relevance',
    prompt: 'What feels most relevant right now?',
    helper: 'Select up to 3.',
    kind: 'multi',
    maxSelections: 3,
    options: [
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
    ],
  },
  {
    id: 'confidence_dependency',
    prompt: 'How much does your confidence depend on your athletic performance?',
    options: ['Not at all', 'A little', 'Somewhat', 'A lot', 'Almost entirely'],
  },
  {
    id: 'self_worth_impact',
    prompt:
      'When things are going poorly in your sport, does it affect how you feel about yourself overall?',
    options: ['Not at all', 'A little', 'Somewhat', 'Significantly', 'Completely'],
  },
  {
    id: 'injury_gate',
    prompt: 'Are you currently injured, or has an injury affected your wellbeing?',
    options: [
      'Yes, currently injured',
      'Not currently injured, but injury has affected me',
      'No',
    ],
  },
  {
    id: 'injury_wellbeing',
    prompt: 'Has your injury affected your mental wellbeing during your athletic career?',
    branch: 'injury',
    options: ['Not applicable', 'Not at all', 'A little', 'Moderately', 'Significantly'],
  },
  {
    id: 'injury_isolation',
    prompt: 'How isolated or disconnected do you feel from your team?',
    branch: 'injury',
    options: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Extremely'],
  },
  {
    id: 'injury_hardest',
    prompt: 'What has been hardest mentally being injured?',
    helper: 'Select all that apply.',
    branch: 'injury',
    kind: 'multi',
    options: [
      'Fear of losing my spot / scholarship',
      'Pressure to return quickly',
      'Losing confidence in my body / ability',
      'Watching teammates compete without me',
      'Other',
    ],
  },
];

type AnswerValue = string | string[];
type Answers = Record<string, AnswerValue>;

const hasAnswer = (answers: Answers, question: Question) => {
  const answer = answers[question.id];
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
};

const isInjuryBranchActive = (answers: Answers) => {
  const answer = answers.injury_gate;
  return typeof answer === 'string' && answer !== 'No';
};

type AnswerOptionButtonProps = {
  option: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function AnswerOptionButton({
  option,
  selected,
  disabled = false,
  onSelect,
}: AnswerOptionButtonProps) {
  return (
    <button
      aria-pressed={selected}
      className={[
        'min-h-[64px] rounded-2xl border px-4 py-3 text-base font-semibold transition-all duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f7b67]',
        selected
          ? 'border-[#3f7b67] bg-[#4f846e] text-white shadow-[0_14px_30px_rgba(63,123,103,0.18)]'
          : 'border-[#ded8cf] bg-white/75 text-[#1f2622] shadow-[0_8px_20px_rgba(31,38,34,0.025)] hover:-translate-y-0.5 hover:border-[#8aa99c] hover:bg-[#f5faf6]',
        disabled ? 'cursor-not-allowed opacity-45 hover:translate-y-0 hover:border-[#ded8cf]' : '',
      ].join(' ')}
      type="button"
      disabled={disabled}
      onClick={onSelect}
    >
      {option}
    </button>
  );
}

type QuestionRowProps = {
  question: Question;
  displayNumber: number;
  selectedAnswer?: AnswerValue;
  onSelect: (question: Question, option: string) => void;
};

export function QuestionRow({
  question,
  displayNumber,
  selectedAnswer,
  onSelect,
}: QuestionRowProps) {
  const selectedOptions = Array.isArray(selectedAnswer) ? selectedAnswer : [];
  const isMulti = question.kind === 'multi';
  const isAtMax =
    isMulti &&
    typeof question.maxSelections === 'number' &&
    selectedOptions.length >= question.maxSelections;

  return (
    <div className="border-b border-[#e6dfd5] py-9 last:border-b-0">
      <div className="mb-6 flex items-start gap-4">
        <span className="mt-0.5 text-xl font-extrabold leading-none text-[#101714]">
          {displayNumber}.
        </span>
        <div className="min-w-0">
          <h2 className="m-0 break-words font-[Georgia,serif] text-[1.18rem] leading-snug text-[#101714] sm:text-[1.32rem]">
            {question.prompt}
          </h2>
          {question.helper ? (
            <p className="mt-2 text-sm font-semibold text-[#66716b]">{question.helper}</p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {question.options.map((option) => {
          const selected = Array.isArray(selectedAnswer)
            ? selectedAnswer.includes(option)
            : selectedAnswer === option;
          const disabled = Boolean(isAtMax && !selected);

          return (
            <AnswerOptionButton
              key={option}
              option={option}
              selected={selected}
              disabled={disabled}
              onSelect={() => onSelect(question, option)}
            />
          );
        })}
      </div>
    </div>
  );
}

type CardFooterProps = {
  canGoBack: boolean;
  canContinue: boolean;
  isLastPage: boolean;
  onBack: () => void;
  onContinue: () => void;
};

export function CardFooter({
  canGoBack,
  canContinue,
  isLastPage,
  onBack,
  onContinue,
}: CardFooterProps) {
  return (
    <footer className="flex flex-col gap-4 border-t border-[#e6dfd5] bg-[#faf8f4] px-5 py-5 sm:px-8 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
      <button
        className="inline-flex min-h-[52px] items-center justify-center gap-3 rounded-xl border border-[#ded8cf] bg-white px-6 text-base font-semibold text-[#1f2622] transition hover:-translate-x-0.5 hover:border-[#8aa99c] hover:bg-[#f7fbf8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f7b67] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-x-0 md:justify-self-start"
        type="button"
        disabled={!canGoBack}
        onClick={onBack}
      >
        <ArrowLeft size={20} aria-hidden="true" />
        Back
      </button>

      <button
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#3f7b67] transition hover:bg-[#eff6f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f7b67]"
        type="button"
      >
        <Bookmark size={19} aria-hidden="true" />
        Save for later
      </button>

      <button
        className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-xl bg-[#3f7b67] px-8 text-base font-bold text-white shadow-[0_18px_38px_rgba(63,123,103,0.22)] transition hover:-translate-y-0.5 hover:bg-[#346c5a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f7b67] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 md:justify-self-end"
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
      >
        {isLastPage ? 'Continue' : 'Continue'}
        <ArrowRight size={21} aria-hidden="true" />
      </button>
    </footer>
  );
}

type QuestionCardProps = {
  answers: Answers;
  visibleQuestions: Question[];
  pageQuestions: Question[];
  pageIndex: number;
  totalPages: number;
  startIndex: number;
  onSelect: (question: Question, option: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function QuestionCard({
  answers,
  visibleQuestions,
  pageQuestions,
  pageIndex,
  totalPages,
  startIndex,
  onSelect,
  onBack,
  onContinue,
}: QuestionCardProps) {
  const canContinue = pageQuestions.every((question) => hasAnswer(answers, question));
  const endIndex = Math.min(startIndex + pageQuestions.length, visibleQuestions.length);

  return (
    <section
      aria-label="Private athlete support check-in questions"
      className="w-full overflow-hidden rounded-[1.75rem] border border-[#e0d9cf] bg-white shadow-[0_20px_60px_rgba(54,64,57,0.10)]"
    >
      <div className="px-5 pb-2 pt-7 sm:px-8 lg:px-10">
        <div className="mb-2 flex flex-wrap items-center gap-4">
          <span className="rounded-full bg-[#e8f0ea] px-5 py-3 text-base font-semibold text-[#3f7b67]">
            Page {pageIndex + 1} of {totalPages}
          </span>
          <span className="text-base font-semibold text-[#59645f]">
            Questions {startIndex + 1}-{endIndex}
          </span>
        </div>

        {pageQuestions.map((question, index) => (
          <QuestionRow
            key={question.id}
            question={question}
            displayNumber={startIndex + index + 1}
            selectedAnswer={answers[question.id]}
            onSelect={onSelect}
          />
        ))}
      </div>

      <CardFooter
        canGoBack={pageIndex > 0}
        canContinue={canContinue}
        isLastPage={pageIndex === totalPages - 1}
        onBack={onBack}
        onContinue={onContinue}
      />
    </section>
  );
}

type TopBadgeProps = {
  questionCount: number;
};

export function TopBadge({ questionCount }: TopBadgeProps) {
  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-full border border-[#d9d4c8] bg-[#edeae2] px-4 py-2 text-xs font-semibold text-[#53635c] shadow-[0_4px_14px_rgba(54,64,57,0.06)] sm:text-sm">
      <ShieldCheck className="shrink-0 text-[#3f7b67]" size={17} aria-hidden="true" />
      <span className="min-w-0 whitespace-normal">
        <span className="text-[#3f7b67]">Private athlete support check-in</span>
        <span className="mx-2 text-[#8a8f88]">•</span>
        {questionCount} questions
        <span className="mx-2 text-[#8a8f88]">•</span>
        about 3 minutes
      </span>
    </div>
  );
}

export function PrivacyNote() {
  return (
    <div className="mt-7 flex flex-col items-center gap-3 text-center">
      <p className="m-0 flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-[#6d746f]">
        <LockKeyhole size={17} className="text-[#59645f]" aria-hidden="true" />
        <span>Your answers are private and secure.</span>
        <a className="border-b border-[#3f7b67] text-[#3f7b67]" href="/privacy">
          Learn more
        </a>
      </p>

      <div className="group relative max-w-[620px] text-left text-xs font-semibold text-[#717a74]">
        <button
          className="inline-flex cursor-help items-center gap-1.5 rounded-full px-3 py-1.5 transition hover:bg-[#ebe6dc] hover:text-[#3f7b67] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f7b67]"
          type="button"
          aria-describedby="assessment-important-info"
        >
          <Info size={14} aria-hidden="true" />
          Important info
        </button>
        <div
          id="assessment-important-info"
          className="pointer-events-none absolute bottom-1/2 left-full z-20 ml-4 w-[min(760px,calc(100vw-2rem))] translate-y-1/2 rounded-[1.25rem] rounded-bl-md border border-[#ded8cf] bg-white/95 p-4 leading-6 opacity-0 shadow-[0_14px_34px_rgba(54,64,57,0.08)] transition duration-150 before:absolute before:left-[-8px] before:top-1/2 before:h-4 before:w-4 before:-translate-y-1/2 before:rotate-45 before:border-b before:border-l before:border-[#ded8cf] before:bg-white/95 before:content-[''] group-hover:opacity-100 group-focus-within:opacity-100 max-sm:bottom-auto max-sm:left-1/2 max-sm:top-full max-sm:ml-0 max-sm:mt-3 max-sm:-translate-x-1/2 max-sm:translate-y-0 max-sm:rounded-bl-[1.25rem] max-sm:before:left-1/2 max-sm:before:top-[-8px] max-sm:before:-translate-x-1/2 max-sm:before:translate-y-0 max-sm:before:border-b-0 max-sm:before:border-l-0 max-sm:before:border-r max-sm:before:border-t"
          role="tooltip"
        >
          <p className="m-0">
            This is educational, not diagnosis or therapy. Results are private
            to the athlete; coaches, schools, and teams will not see individual
            answers. If you request a provider match, you choose what to share.
            If you are in crisis, use emergency or crisis resources.
          </p>
        </div>
      </div>
    </div>
  );
}

export function CheckInPage() {
  const [answers, setAnswers] = useState<Answers>({});
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = '#f4f0e8';
    document.documentElement.style.background = '#f4f0e8';
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  const visibleQuestions = useMemo(
    () =>
      questions.filter((question) => {
        if (question.branch === 'injury') {
          return isInjuryBranchActive(answers);
        }

        return true;
      }),
    [answers],
  );
  const totalPages = Math.max(1, Math.ceil(visibleQuestions.length / 3));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const startIndex = safePageIndex * 3;
  const pageQuestions = visibleQuestions.slice(startIndex, startIndex + 3);

  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(totalPages - 1);
    }
  }, [pageIndex, totalPages]);

  const selectAnswer = (question: Question, option: string) => {
    setAnswers((current) => {
      if (question.kind !== 'multi') {
        const nextAnswers = { ...current, [question.id]: option };

        if (question.id === 'injury_gate' && option === 'No') {
          delete nextAnswers.injury_wellbeing;
          delete nextAnswers.injury_isolation;
          delete nextAnswers.injury_hardest;
        }

        return nextAnswers;
      }

      const currentSelection = Array.isArray(current[question.id])
        ? (current[question.id] as string[])
        : [];
      const selected = currentSelection.includes(option);
      const nextSelection = selected
        ? currentSelection.filter((item) => item !== option)
        : [...currentSelection, option].slice(0, question.maxSelections);

      return { ...current, [question.id]: nextSelection };
    });
  };

  const goBack = () => {
    setPageIndex((current) => Math.max(0, current - 1));
  };

  const goContinue = () => {
    setPageIndex((current) => Math.min(totalPages - 1, current + 1));
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#f4f0e8] px-4 py-8 text-[#101714] sm:px-6 sm:py-10 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(74,140,120,0.06),transparent_36rem),radial-gradient(ellipse_at_82%_80%,rgba(120,160,100,0.04),transparent_32rem)]" />
      <div className="relative z-10 mx-auto w-full max-w-[1180px]">
        <header className="mb-9 sm:mb-10">
          <TopBadge questionCount={visibleQuestions.length} />
          <div className="mt-9 max-w-[860px]">
            <h1 className="m-0 max-w-full font-[Georgia,serif] text-[2.55rem] leading-[1.03] text-[#090d0b] sm:text-[4.25rem] lg:text-[4.95rem]">
              Let's understand what you're carrying
            </h1>
            <p className="mt-6 max-w-[560px] break-words text-lg leading-8 text-[#59645f] sm:text-xl">
              Help us personalize your experience. Your responses help surface
              information and resources that may be most relevant to you.
            </p>
          </div>
        </header>

        <QuestionCard
          answers={answers}
          visibleQuestions={visibleQuestions}
          pageQuestions={pageQuestions}
          pageIndex={safePageIndex}
          totalPages={totalPages}
          startIndex={startIndex}
          onSelect={selectAnswer}
          onBack={goBack}
          onContinue={goContinue}
        />
        <PrivacyNote />
      </div>
    </main>
  );
}

export function PressureCheckPage() {
  return <CheckInPage />;
}
