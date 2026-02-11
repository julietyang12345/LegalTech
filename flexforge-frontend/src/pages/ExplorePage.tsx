import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Menu, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/common';

interface SkillCard {
  emoji: string;
  name: string;
  description: string;
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  category: string;
  hasDemo?: boolean;
}

const CATEGORIES = [
  'All',
  'Thinking & Decisions',
  'AI & Tech',
  'Career',
  'Parenting & Life',
  'Niche Skills',
  'Communication',
  'Creative',
  'Business',
] as const;

const SKILLS: SkillCard[] = [
  {
    emoji: '🤖',
    name: 'AI Prompt Engineering',
    description:
      'Write prompts that get consistent, useful results — not vague guesses. Structure, context, and output control.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'AI & Tech',
    hasDemo: true,
  },
  {
    emoji: '🧠',
    name: 'Systems Thinking',
    description:
      'See how parts connect. Make better decisions when there\'s no clear right answer — trade-offs, feedback loops, second-order effects.',
    duration: '7 days',
    difficulty: 'Intermediate',
    category: 'Thinking & Decisions',
  },
  {
    emoji: '🔍',
    name: 'Attention to Detail',
    description:
      'Train yourself to catch what others miss — in code, writing, design, and everyday decisions.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Thinking & Decisions',
  },
  {
    emoji: '🐛',
    name: 'Debugging Unknown Bugs',
    description:
      'Systematic approaches to hunt down bugs when you have no idea what\'s wrong. Reproduce, isolate, and fix.',
    duration: '7 days',
    difficulty: 'Intermediate',
    category: 'Niche Skills',
  },
  {
    emoji: '🎯',
    name: 'Making Hard Decisions',
    description:
      'Frameworks for decisions with incomplete info, competing priorities, and no "right" answer. For work and life.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Thinking & Decisions',
  },
  {
    emoji: '🔄',
    name: 'Career Pivot to Tech',
    description:
      'A structured path from non-tech background into your first tech role. Skills, portfolio, and job search strategy.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Career',
  },
  {
    emoji: '✅',
    name: 'AI Output Validation',
    description:
      'How to verify, test, and trust AI-generated content — code, text, data. Know when the AI is wrong.',
    duration: '7 days',
    difficulty: 'Intermediate',
    category: 'AI & Tech',
  },
  {
    emoji: '🎪',
    name: 'Engaging Play with Kids',
    description:
      'Turn playtime into something fun for both of you. Creative activities, developmental games, and staying present.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Parenting & Life',
  },
  {
    emoji: '📐',
    name: 'Requirement Architecture',
    description:
      'Turn vague stakeholder needs into clear, testable requirements. Avoid building the wrong thing.',
    duration: '7 days',
    difficulty: 'Intermediate',
    category: 'Niche Skills',
  },
  {
    emoji: '🗣️',
    name: 'Giving Difficult Feedback',
    description:
      'Have the hard conversations at work without damaging relationships. Direct, kind, and effective.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Communication',
  },
  {
    emoji: '📝',
    name: 'Writing That Gets Read',
    description:
      'Clear, concise writing for emails, docs, and proposals. Stop burying the point. Make people actually read it.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Communication',
  },
  {
    emoji: '🧩',
    name: 'First Principles Thinking',
    description:
      'Break problems down to their fundamentals instead of copying existing solutions. Think from scratch.',
    duration: '7 days',
    difficulty: 'Intermediate',
    category: 'Thinking & Decisions',
  },
  {
    emoji: '🎨',
    name: 'Design for Non-Designers',
    description:
      'Make things look good without design school. Layout, color, typography — practical rules you can apply today.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Creative',
  },
  {
    emoji: '💰',
    name: 'Freelancing from Zero',
    description:
      'Find clients, price your work, write proposals, and manage projects. Go from side gig to real income.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Business',
  },
  {
    emoji: '🧘',
    name: 'Managing Work Anxiety',
    description:
      'Practical techniques for when work stress gets overwhelming. Boundaries, prioritization, and staying grounded.',
    duration: '7 days',
    difficulty: 'Beginner',
    category: 'Parenting & Life',
  },
  {
    emoji: '🏗️',
    name: 'Building a Side Project',
    description:
      'From idea to shipped product. Scope ruthlessly, build fast, get users. Stop planning, start making.',
    duration: '7 days',
    difficulty: 'Intermediate',
    category: 'Business',
  },
];

const DIFFICULTY_COLORS = {
  Beginner: 'bg-green-100 text-green-700',
  Intermediate: 'bg-amber-100 text-amber-700',
  Advanced: 'bg-red-100 text-red-700',
};

function ExploreNav() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-xl text-gray-900">
              FlexForge
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')}>
              Log In
            </Button>
            <Button onClick={() => navigate('/register')}>Sign Up Free</Button>
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden py-4 border-t border-gray-100"
          >
            <div className="flex flex-col gap-3">
              <Button variant="ghost" onClick={() => navigate('/login')}>
                Log In
              </Button>
              <Button onClick={() => navigate('/register')}>
                Sign Up Free
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </nav>
  );
}

export function ExplorePage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filtered = useMemo(() => {
    return SKILLS.filter((skill) => {
      return activeCategory === 'All' || skill.category === activeCategory;
    });
  }, [activeCategory]);

  return (
    <div className="min-h-screen bg-gray-50">
      <ExploreNav />

      {/* Hero */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Explore Skills
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto mb-8">
            Topics you won't find on Udemy. Pick one or describe your own — we'll build a
            structured curriculum around it.
          </p>

        </div>
      </section>

      {/* Category pills */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={clsx(
                'px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                activeCategory === cat
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">
              No skills match your search. Try a different term.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((skill, i) => (
              <motion.div
                key={skill.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.4) }}
                className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{skill.emoji}</span>
                  <span
                    className={clsx(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      DIFFICULTY_COLORS[skill.difficulty]
                    )}
                  >
                    {skill.difficulty}
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1">
                  {skill.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4 flex-1">
                  {skill.description}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                  <span>{skill.duration}</span>
                  <span>{skill.category}</span>
                </div>

                <div className="space-y-2">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      navigate(
                        `/register?skill=${encodeURIComponent(skill.name)}`
                      )
                    }
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Start Learning
                  </Button>
                  {skill.hasDemo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate('/demo')}
                      leftIcon={<Play className="w-4 h-4" />}
                    >
                      Try Demo
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="py-12 px-4 bg-gray-900 text-gray-400">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔥</span>
              <span className="font-display font-bold text-xl text-white">
                FlexForge
              </span>
            </div>
            <div className="flex gap-8">
              <Link
                to="/privacy"
                className="hover:text-white transition-colors"
              >
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm">
            &copy; {new Date().getFullYear()} FlexForge. Built with 🔥 for
            learners everywhere.
          </div>
        </div>
      </footer>
    </div>
  );
}
