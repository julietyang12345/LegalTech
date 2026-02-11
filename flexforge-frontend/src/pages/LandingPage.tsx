import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  CheckCircle,
  Zap,
  Brain,
  Trophy,
  Clock,
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-xl text-gray-900">FlexForge</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link to="/explore" className="text-gray-600 hover:text-gray-900 transition-colors">Explore</Link>
            <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
            {/* <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a> */}
            <a href="#contact" className="text-gray-600 hover:text-gray-900 transition-colors">Contact</a>
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
            className="md:hidden py-4 border-t border-gray-100"
          >
            <div className="flex flex-col gap-4">
              <Link to="/explore" className="text-gray-600 hover:text-gray-900">Explore</Link>
              <a href="#features" className="text-gray-600 hover:text-gray-900">Features</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900">How It Works</a>
              {/* <a href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</a> */}
              <a href="#contact" className="text-gray-600 hover:text-gray-900">Contact</a>
              <hr className="border-gray-100" />
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
    days: ['Mental models for trade-offs', 'Stakeholder alignment', 'Deciding under uncertainty'],
  },
  {
    query: 'Fun activities that don\'t bore me while playing with my toddler',
    days: ['Sensory play that adults enjoy too', 'Storytelling games', 'Outdoor micro-adventures'],
  },
  {
    query: 'Switching from marketing to product management',
    days: ['Transferable skills audit', 'PM frameworks crash course', 'Building your first PRD'],
  },
  {
    query: 'How to validate AI-generated code before shipping',
    days: ['Common AI failure patterns', 'Testing strategies for AI output', 'Building a review checklist'],
  },
  {
    query: 'Becoming more detail-oriented at work',
    days: ['Attention training exercises', 'Checklists that actually work', 'Review habits that catch mistakes'],
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
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        {/* Input area */}
        <div className="p-5 sm:p-6 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            I want to learn...
          </p>
          <div className="relative h-7 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="text-lg font-medium text-gray-900 absolute inset-0"
              >
                {topic.query}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* Generated curriculum preview */}
        <div className="p-5 sm:p-6 bg-gray-50/50">
          <p className="text-xs font-medium text-focus-600 uppercase tracking-wider mb-3">
            Your 7-day curriculum
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
                  <span className="text-sm text-gray-700">{day}</span>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-3 text-gray-400"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs">
                  ...
                </span>
                <span className="text-sm">+ 4 more days</span>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-3 bg-gray-50/50 border-t border-gray-100">
          {HERO_TOPICS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={clsx(
                'w-2 h-2 rounded-full transition-all duration-300',
                i === index ? 'bg-brand-500 w-6' : 'bg-gray-300 hover:bg-gray-400'
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
          className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight"
        >
          Learn what{' '}
          <span
            className="text-transparent bg-clip-text animate-shimmer"
            style={{
              backgroundImage: 'linear-gradient(90deg, #2D5A87, #10B981, #2D5A87)',
              backgroundSize: '200% auto',
            }}
          >
            no course covers
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto"
        >
          Niche skills, messy real-world problems, career pivots — describe what you need to learn and
          get a structured curriculum that turns knowledge into actual skill.
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

// Features section
function FeaturesSection() {
  const features = [
    {
      icon: Brain,
      title: 'Any Topic, Any Depth',
      description: 'From niche technical skills to soft skills to things you can\'t find on Udemy — describe it and get a real curriculum, not a generic overview.',
      color: 'from-brand-500 to-brand-600',
    },
    {
      icon: Clock,
      title: 'Structured, Not Scattered',
      description: 'No more bouncing between random tutorials. Each day builds on the last with concept cards, exercises, and quizzes in the right order.',
      color: 'from-focus-500 to-emerald-500',
    },
    {
      icon: Trophy,
      title: 'Knowledge Becomes Skill',
      description: 'Daily micro-projects force you to apply what you learned. By the end you\'ve built something real, not just watched someone else do it.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Zap,
      title: 'Ask When You\'re Stuck',
      description: 'An AI tutor that knows your curriculum, your progress, and where you got confused. Ask questions in context, not from scratch.',
      color: 'from-alert-500 to-orange-500',
    },
  ];

  return (
    <section id="features" className="py-20 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Built for the things you can't Google
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Whether it's a career pivot, a niche technical skill, or a problem with no textbook answer.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: index * 0.15, duration: 0.5 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 group cursor-default"
            >
              <motion.div
                className={clsx(
                  'w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-6',
                  feature.color
                )}
                whileHover={{ rotate: [0, -5, 5, 0], transition: { duration: 0.5 } }}
              >
                <feature.icon className="w-7 h-7 text-white" />
              </motion.div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-brand-600 transition-colors">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// How it works
function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      title: 'Describe your goal',
      description: 'Tell us what you want to learn. We pick the right direction, depth, and learning style for you.',
    },
    {
      number: '02',
      title: 'Learn with structure',
      description: 'Each day: watch curated videos (or read AI explanations), work through foundation cards, and complete interactive exercises.',
    },
    {
      number: '03',
      title: 'Build as you go',
      description: 'Daily micro-steps contribute to a real project. By the end, you have working code you can show off.',
    },
    {
      number: '04',
      title: 'Track your growth',
      description: 'See your skill tree expand. Save sessions to your Vault. Pick up where you left off anytime.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            How FlexForge Works
          </h2>
          <p className="text-xl text-gray-600">
            From zero to skilled in four simple steps
          </p>
        </motion.div>

        <div className="relative">
          {/* Animated connector line */}
          <div className="absolute left-8 top-16 bottom-16 w-px hidden sm:block">
            <motion.div
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="h-full w-full bg-gradient-to-b from-brand-300 via-focus-300 to-brand-300 origin-top"
            />
          </div>

          <div className="space-y-12">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.2, duration: 0.5 }}
                className="flex gap-6 items-start relative"
              >
                <motion.div
                  className="flex-shrink-0 w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center relative z-10"
                  whileInView={{
                    boxShadow: ['0 0 0 0 rgba(45,90,135,0)', '0 0 0 8px rgba(45,90,135,0.1)', '0 0 0 0 rgba(45,90,135,0)'],
                  }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + index * 0.2, duration: 1.5 }}
                >
                  <span className="text-2xl font-bold text-brand-600">{step.number}</span>
                </motion.div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
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
    <section id="pricing" className="py-20 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600">
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
              className="bg-white rounded-2xl p-8 shadow-lg flex flex-col h-full"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                {plan.period && <span className="text-gray-500">{plan.period}</span>}
              </div>
              <p className="text-gray-600 mb-6">{plan.description}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
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
            Stop searching. Start learning.
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Describe what you need to learn. We'll handle the rest.
          </p>
          <Button
            size="xl"
            variant="secondary"
            onClick={() => navigate('/register')}
            rightIcon={<ChevronRight className="w-5 h-5" />}
            className="bg-white text-brand-600 hover:bg-gray-100"
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
    <section id="contact" className="py-20 px-4 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mx-auto mb-6">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            We'd Love to Hear From You
          </h2>
          <p className="text-xl text-gray-600">
            Have feedback, questions, or ideas? Let us know what you think.
          </p>
        </div>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-8 shadow-lg text-center"
          >
            <div className="w-16 h-16 bg-focus-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-focus-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
            <p className="text-gray-600 mb-6">
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
            className="bg-white rounded-2xl p-8 shadow-lg space-y-6"
          >
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                           focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                           transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                           focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                           transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind?"
                required
                rows={5}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                         focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
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
    <div className="min-h-screen bg-white">
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
