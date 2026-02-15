import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  CheckCircle,
  Trophy,
  ChevronRight,
  ArrowRight,
  Menu,
  X,
  Send,
  MessageSquare,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/common';

// Floating orbs background
function GradientBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden -z-10">
      <div className="absolute top-20 left-[10%] w-72 h-72 bg-brand-200/30 rounded-full blur-3xl animate-float-slow" />
      <div className="absolute top-40 right-[15%] w-96 h-96 bg-focus-200/20 rounded-full blur-3xl animate-float-medium" style={{ animationDelay: '2s' }} />
      <div className="absolute -bottom-20 left-[30%] w-80 h-80 bg-brand-100/40 rounded-full blur-3xl animate-float-fast" style={{ animationDelay: '1s' }} />
      <div className="absolute top-60 left-[60%] w-40 h-40 bg-focus-300/15 rounded-full blur-2xl animate-float-slow" style={{ animationDelay: '3s' }} />
    </div>
  );
}

// Navigation
function LandingNav() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-xl text-content">FlexForge</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link to="/explore" className="text-content-secondary hover:text-content transition-colors">Explore</Link>
            <a href="#features" className="text-content-secondary hover:text-content transition-colors">Features</a>
            <a href="#how-it-works" className="text-content-secondary hover:text-content transition-colors">How It Works</a>
            {/* <a href="#pricing" className="text-content-secondary hover:text-content transition-colors">Pricing</a> */}
            <a href="#contact" className="text-content-secondary hover:text-content transition-colors">Contact</a>
          </div>

          {/* CTA buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')}>
              Log In
            </Button>
            <Button onClick={() => navigate('/register')}>
              Start Free
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden py-4 border-t border-border-secondary"
          >
            <div className="flex flex-col gap-4">
              <Link to="/explore" className="text-content-secondary hover:text-content">Explore</Link>
              <a href="#features" className="text-content-secondary hover:text-content">Features</a>
              <a href="#how-it-works" className="text-content-secondary hover:text-content">How It Works</a>
              {/* <a href="#pricing" className="text-content-secondary hover:text-content">Pricing</a> */}
              <a href="#contact" className="text-content-secondary hover:text-content">Contact</a>
              <hr className="border-border-secondary" />
              <Button variant="ghost" onClick={() => navigate('/login')}>Log In</Button>
              <Button onClick={() => navigate('/register')}>Start Free</Button>
            </div>
          </motion.div>
        )}
      </div>
    </nav>
  );
}

const HERO_TOPICS = [
  {
    query: 'How to make trade-off decisions as a tech lead',
    mode: 'Learn & Master',
    days: ['Mental models for trade-offs', 'Stakeholder alignment', 'Deciding under uncertainty'],
  },
  {
    query: 'Build a budget tracker app from scratch',
    mode: 'Project Lab',
    days: ['Set up the project and data model', 'Build the transaction input UI', 'Add charts and spending insights'],
  },
  {
    query: 'Build an email summarizer with the Claude API',
    mode: 'AI Builder',
    days: ['Connect to the Claude API', 'Parse and chunk email threads', 'Generate and display summaries'],
  },
  {
    query: 'Learn Japanese for my trip to Tokyo',
    mode: 'Speak & Write',
    days: ['Essential greetings and phrases', 'Ordering food and asking for directions', 'Reading signs and menus'],
  },
];

function TopicCycler() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % HERO_TOPICS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const topic = HERO_TOPICS[index];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mt-16 max-w-3xl mx-auto"
    >
      <div className="bg-surface rounded-2xl shadow-xl border border-border overflow-hidden">
        {/* Input area */}
        <div className="p-5 sm:p-6 border-b border-border-secondary">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-content-tertiary uppercase tracking-wider">
              I want to learn...
            </p>
            <AnimatePresence mode="wait">
              <motion.span
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full"
              >
                {topic.mode}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="relative h-7 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="text-lg font-medium text-content absolute inset-0"
              >
                {topic.query}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* Generated curriculum preview */}
        <div className="p-5 sm:p-6 bg-surface-secondary/50">
          <p className="text-xs font-medium text-focus-600 uppercase tracking-wider mb-3">
            Your learning path
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="space-y-2"
            >
              {topic.days.map((day, i) => (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-focus-100 text-focus-700 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-sm text-content-secondary">{day}</span>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-3 text-content-tertiary"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-tertiary flex items-center justify-center text-xs">
                  ...
                </span>
                <span className="text-sm">+ 4 more days</span>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-3 bg-surface-secondary/50 border-t border-border-secondary">
          {HERO_TOPICS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={clsx(
                'w-2 h-2 rounded-full transition-all duration-300',
                i === index ? 'bg-brand-500 w-6' : 'bg-surface-tertiary hover:bg-border'
              )}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Hero section
function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-32 pb-20 px-4 overflow-hidden">
      <GradientBackground />
      
      <div className="max-w-4xl mx-auto text-center">
        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold text-content mb-6 leading-tight"
        >
          Learn by doing,{' '}
          <span
            className="text-transparent bg-clip-text animate-shimmer"
            style={{
              backgroundImage: 'linear-gradient(90deg, #2D5A87, #10B981, #2D5A87)',
              backgroundSize: '200% auto',
            }}
          >
            not just reading
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl text-content-secondary mb-8 max-w-2xl mx-auto"
        >
          Learn a skill, build a project, create with AI, or pick up a language —
          hands-on sessions that turn knowledge into something you can actually do.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            size="xl"
            onClick={() => navigate('/register')}
            rightIcon={<ArrowRight className="w-5 h-5" />}
          >
            Start Learning Free
          </Button>
          <Button
            size="xl"
            variant="secondary"
            onClick={() => navigate('/demo')}
            leftIcon={<Play className="w-5 h-5" />}
          >
            Try a Sample Session
          </Button>
        </motion.div>

        {/* Explore link */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-center"
        >
          <Link to="/explore" className="text-sm text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2">
            Browse sample skills &rarr;
          </Link>
        </motion.div>
      </div>

      {/* Cycling topic demo */}
      <TopicCycler />
    </section>
  );
}

// Animated chat simulation
function ChatSimulation() {
  const messages = [
    { role: 'user' as const, text: 'Teach me systems thinking' },
    { role: 'ai' as const, text: 'Systems thinking is a holistic approach to analysis that focuses on how components interrelate and work together over time within larger systems...' },
    { role: 'user' as const, text: 'Can you give me an example?' },
    { role: 'ai' as const, text: 'Sure! Consider a hospital. If you add more beds without more nurses, wait times may actually increase because...' },
  ];

  return (
    <div className="space-y-3">
      {messages.map((msg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.25, duration: 0.3 }}
          className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
        >
          <div className={clsx(
            'rounded-2xl px-4 py-2.5 max-w-[85%] text-sm',
            msg.role === 'user'
              ? 'bg-surface-tertiary text-content rounded-br-md'
              : 'bg-surface-tertiary text-content-secondary rounded-bl-md'
          )}>
            {msg.role === 'ai' && i === messages.length - 1 ? (
              <span>
                {msg.text.slice(0, 60)}
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-content-tertiary"
                >
                  ...
                </motion.span>
              </span>
            ) : msg.role === 'ai' ? (
              <span>{msg.text.slice(0, 80)}...</span>
            ) : (
              msg.text
            )}
          </div>
        </motion.div>
      ))}
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 1.5 }}
        className="text-xs text-content-tertiary text-center pt-2 italic"
      >
        You read it, you nod, you forget it tomorrow.
      </motion.p>
    </div>
  );
}

function CurriculumSimulation() {
  const items = [
    { icon: '📚', label: 'Learn: Systems thinking basics', type: 'Concept cards + quiz' },
    { icon: '🛠️', label: 'Build: Budget tracker app', type: 'Hands-on project step' },
    { icon: '🤖', label: 'Create: Email summarizer AI', type: 'Code with Claude API' },
    { icon: '🗣️', label: 'Speak: Japanese greetings', type: 'Practice conversation' },
  ];

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 + i * 0.2, duration: 0.4 }}
          className="group/item"
        >
          <motion.div
            whileHover={{ x: 4, transition: { duration: 0.15 } }}
            className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3 border border-border-secondary shadow-sm"
          >
            <span className="text-lg">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content truncate">{item.label}</p>
              <p className="text-xs text-content-tertiary">{item.type}</p>
            </div>
            {i === 0 && (
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 1.2, type: 'spring', stiffness: 300 }}
                className="w-5 h-5 rounded-full bg-focus-500 flex items-center justify-center flex-shrink-0"
              >
                <CheckCircle className="w-3.5 h-3.5 text-white" />
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 1.4 }}
        className="flex items-center gap-2 pt-2 px-1"
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-focus-400"
        />
        <span className="text-xs font-medium text-focus-600">
          You practice, you apply, you actually remember.
        </span>
      </motion.div>
    </div>
  );
}

// Features section — AI vs FlexForge comparison
function FeaturesSection() {
  const comparison = [
    { ai: 'Gives you a wall of text', ff: 'Breaks it into daily hands-on sessions' },
    { ai: 'Answers what you ask', ff: 'Teaches what you don\'t know to ask' },
    { ai: 'No structure or progression', ff: 'Courses, projects, AI apps, or language practice' },
    { ai: 'You read and forget', ff: 'You build, practice, and actually remember' },
    { ai: 'Starts from scratch every time', ff: 'Remembers your progress and adapts' },
  ];

  return (
    <section id="features" className="py-20 px-4 bg-surface-secondary">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6"
        >
          <h2 className="text-3xl font-bold text-content mb-4">
            AI gives you knowledge.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-focus-500">
              We help you build skills.
            </span>
          </h2>
          <p className="text-xl text-content-secondary max-w-2xl mx-auto">
            Chatbots answer questions. FlexForge turns those answers into something you can actually do.
          </p>
        </motion.div>

        {/* Side-by-side visual */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* AI chat side */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-border bg-surface overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-border-secondary flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-surface-tertiary flex items-center justify-center">
                <MessageSquare className="w-3.5 h-3.5 text-content-tertiary" />
              </div>
              <span className="text-sm font-medium text-content-tertiary">Conversational AI</span>
            </div>
            <div className="p-5">
              <ChatSimulation />
            </div>
          </motion.div>

          {/* FlexForge side */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="rounded-2xl border-2 border-brand-200 bg-brand-50/30 overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-brand-100 flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <span className="text-sm font-bold text-brand-700">FlexForge</span>
            </div>
            <div className="p-5">
              <CurriculumSimulation />
            </div>
          </motion.div>
        </div>

        {/* Comparison rows */}
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 gap-4 mb-3 px-2">
            <p className="text-xs font-medium text-content-tertiary uppercase tracking-wider">Conversational AI</p>
            <p className="text-xs font-medium text-brand-500 uppercase tracking-wider">FlexForge</p>
          </div>
          <div className="space-y-2">
            {comparison.map((row, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="flex items-start gap-2 bg-surface rounded-lg px-3 py-2.5 border border-border-secondary">
                  <X className="w-4 h-4 text-content-tertiary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-content-tertiary">{row.ai}</span>
                </div>
                <div className="flex items-start gap-2 bg-focus-50 rounded-lg px-3 py-2.5 border border-focus-100">
                  <CheckCircle className="w-4 h-4 text-focus-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-content-secondary">{row.ff}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Step illustrations
function DescribeIllustration() {
  const texts = ['Master systems thinking', 'Build a habit tracker app', 'Create an AI writing tool', 'Learn Spanish for travel'];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % texts.length), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-surface-secondary rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs text-content-tertiary font-medium">
        <div className="w-2 h-2 rounded-full bg-focus-400" />
        Your goal
      </div>
      <div className="relative h-6 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-medium text-content absolute inset-0"
          >
            {texts[idx]}
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="text-brand-500"
            >
              |
            </motion.span>
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function LearnIllustration() {
  return (
    <div className="space-y-2">
      {['Concept Cards', 'Video Lesson', 'Quiz'].map((label, i) => (
        <motion.div
          key={label}
          initial={{ width: 0, opacity: 0 }}
          whileInView={{ width: '100%', opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.2, duration: 0.6, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 bg-surface-secondary rounded-lg px-3 py-2">
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 + i * 0.2, type: 'spring', stiffness: 300 }}
              className={clsx(
                'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                i < 2 ? 'bg-focus-500' : 'bg-surface-tertiary'
              )}
            >
              {i < 2 && <CheckCircle className="w-3.5 h-3.5 text-white" />}
            </motion.div>
            <span className={clsx('text-xs font-medium', i < 2 ? 'text-content-secondary' : 'text-content-tertiary')}>{label}</span>
            {i === 2 && (
              <motion.div
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="ml-auto text-xs text-brand-500 font-medium"
              >
                In progress
              </motion.div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function BuildIllustration() {
  const blocks = [
    { w: 'w-full', color: 'bg-brand-200', label: 'Day 1' },
    { w: 'w-5/6', color: 'bg-brand-300', label: 'Day 2' },
    { w: 'w-4/6', color: 'bg-brand-400', label: 'Day 3' },
    { w: 'w-3/6', color: 'bg-brand-500', label: 'Day 4' },
  ];

  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => (
        <motion.div
          key={i}
          initial={{ scaleX: 0, opacity: 0 }}
          whileInView={{ scaleX: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 + i * 0.15, duration: 0.5, ease: 'easeOut' }}
          className={clsx('origin-left rounded', block.w)}
        >
          <div className={clsx('rounded px-3 py-1.5 flex items-center justify-between', block.color)}>
            <span className="text-xs font-medium text-white/90">{block.label}</span>
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 + i * 0.15 }}
              className="text-xs text-white/60"
            >
              +1 step
            </motion.span>
          </div>
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 1 }}
        className="text-xs text-focus-600 font-medium pt-1 flex items-center gap-1"
      >
        <Trophy className="w-3.5 h-3.5" />
        Project takes shape
      </motion.div>
    </div>
  );
}

function TrackIllustration() {
  const bars = [20, 40, 35, 60, 55, 80, 75];

  return (
    <div className="flex items-end gap-1.5 h-16">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          whileInView={{ height: `${h}%` }}
          viewport={{ once: true }}
          transition={{
            delay: 0.2 + i * 0.1,
            duration: 0.5,
            ease: 'easeOut',
          }}
          className={clsx(
            'flex-1 rounded-t',
            i === bars.length - 1
              ? 'bg-gradient-to-t from-brand-500 to-focus-400'
              : 'bg-brand-200'
          )}
        />
      ))}
    </div>
  );
}

// How it works
function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      title: 'Pick your mode',
      description: 'Master a skill, build a project, create an AI app, or learn a language — choose what fits your goal.',
      illustration: DescribeIllustration,
      accent: 'from-brand-500 to-brand-600',
    },
    {
      number: '02',
      title: 'Learn with structure',
      description: 'Each day: concept cards, videos or explanations, and interactive exercises — in the right order.',
      illustration: LearnIllustration,
      accent: 'from-focus-500 to-emerald-500',
    },
    {
      number: '03',
      title: 'Build as you go',
      description: 'Write real code, practice conversations, or ship a project — you learn by doing, not just reading.',
      illustration: BuildIllustration,
      accent: 'from-purple-500 to-pink-500',
    },
    {
      number: '04',
      title: 'Track your growth',
      description: 'See your progress over time. Save sessions. Pick up where you left off.',
      illustration: TrackIllustration,
      accent: 'from-alert-500 to-orange-500',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-bold text-content mb-4">
            How It Works
          </h2>
          <p className="text-xl text-content-secondary">
            From idea to real skill in four steps
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30, rotateX: 10 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: index * 0.15, duration: 0.5 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-surface rounded-2xl border border-border overflow-hidden group"
            >
              {/* Illustration area */}
              <div className="p-5 pb-4 border-b border-border-secondary bg-gradient-to-br from-surface-secondary to-surface min-h-[120px] flex flex-col justify-center">
                <step.illustration />
              </div>

              {/* Text area */}
              <div className="p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className={clsx(
                    'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-sm font-bold text-white',
                    step.accent
                  )}>
                    {step.number}
                  </span>
                  <h3 className="text-lg font-bold text-content group-hover:text-brand-600 transition-colors">
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm text-content-secondary ml-11">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Pricing section
function PricingSection() {
  const navigate = useNavigate();
  
  const plans = [
    {
      name: 'Free',
      price: '$0',
      description: 'Perfect for getting started',
      features: [
        'Personalized curriculum',
        'Videos + foundation cards',
        'Interactive quizzes',
        'Tutor (3 msgs/day)',
        '1 active curriculum',
      ],
      cta: 'Start Free',
    },
    {
      name: 'Pro',
      price: '$20',
      period: '/month',
      description: 'For serious learners',
      features: [
        'Everything in Free',
        'Tutor (20 msgs/day)',
        'Boss project building',
        'The Vault (saved sessions)',
        'Regenerate day content',
        '3 active curricula',
      ],
      cta: 'Start Pro Trial',
    },
    {
      name: 'Premium',
      price: '$50',
      period: '/month',
      description: 'Maximum learning power',
      features: [
        'Everything in Pro',
        'Unlimited Tutor',
        'Unlimited regenerations',
        'Priority support',
        'Unlimited curricula',
      ],
      cta: 'Go Premium',
    },
  ];

  return (
    <section id="pricing" className="py-20 px-4 bg-surface-secondary">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-content mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-content-secondary">
            Start free, upgrade when you need more
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-surface rounded-2xl p-8 shadow-lg flex flex-col h-full"
            >
              <h3 className="text-xl font-bold text-content mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-content">{plan.price}</span>
                {plan.period && <span className="text-content-tertiary">{plan.period}</span>}
              </div>
              <p className="text-content-secondary mb-6">{plan.description}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-content-secondary">
                    <CheckCircle className="w-5 h-5 text-focus-500 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant="primary"
                className="w-full mt-auto"
                onClick={() => navigate('/register')}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// CTA section
function CTASection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-3xl p-12 text-white"
        >
          <h2 className="text-3xl font-bold mb-4">
            Stop watching. Start building.
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Pick a mode, describe your goal, and start learning by doing — free.
          </p>
          <Button
            size="xl"
            variant="secondary"
            onClick={() => navigate('/register')}
            rightIcon={<ChevronRight className="w-5 h-5" />}
            className="bg-surface text-brand-600 hover:bg-surface-tertiary"
          >
            Start Learning for Free
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

// Contact section
function ContactSection() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api/v1';
      const response = await fetch(`${apiUrl}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setSubmitted(true);
      setName('');
      setEmail('');
      setMessage('');
    } catch (_err) {
      setError('Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="py-20 px-4 bg-surface-secondary">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mx-auto mb-6">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-content mb-4">
            We'd Love to Hear From You
          </h2>
          <p className="text-xl text-content-secondary">
            Have feedback, questions, or ideas? Let us know what you think.
          </p>
        </div>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-2xl p-8 shadow-lg text-center"
          >
            <div className="w-16 h-16 bg-focus-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-focus-600" />
            </div>
            <h3 className="text-xl font-bold text-content mb-2">Message Sent!</h3>
            <p className="text-content-secondary mb-6">
              Thanks for reaching out. We'll get back to you soon.
            </p>
            <Button variant="secondary" onClick={() => setSubmitted(false)}>
              Send Another Message
            </Button>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onSubmit={handleSubmit}
            className="bg-surface rounded-2xl p-8 shadow-lg space-y-6"
          >
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full px-4 py-2.5 bg-surface text-content border border-border rounded-lg
                           placeholder:text-content-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                           transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-2.5 bg-surface text-content border border-border rounded-lg
                           placeholder:text-content-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                           transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind?"
                required
                rows={5}
                className="w-full px-4 py-2.5 bg-surface text-content border border-border rounded-lg
                         placeholder:text-content-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                         transition-colors resize-none"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              rightIcon={<Send className="w-4 h-4" />}
            >
              Send Message
            </Button>
          </motion.form>
        )}
      </div>
    </section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="py-12 px-4 bg-gray-900 text-gray-400">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-xl text-white">FlexForge</span>
          </div>
          <div className="flex gap-8">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm">
          © {new Date().getFullYear()} FlexForge. Built with 🔥 for learners everywhere.
        </div>
      </div>
    </footer>
  );
}

// Main landing page component
export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <LandingNav />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      {/* <PricingSection /> */}
      {/* <CTASection /> */}
      <ContactSection />
      <Footer />
    </div>
  );
}
