import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Play,
  CheckCircle,
  Zap,
  Brain,
  Trophy,
  Clock,
  Sparkles,
  ChevronRight,
  Star,
  ArrowRight,
  Menu,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/common';

// Animated gradient background
function GradientBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden -z-10">
      <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-brand-100 via-transparent to-transparent opacity-50 animate-pulse-soft" />
      <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-focus-100 via-transparent to-transparent opacity-50 animate-pulse-soft" style={{ animationDelay: '1s' }} />
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
            <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
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
              <a href="#features" className="text-gray-600 hover:text-gray-900">Features</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900">How It Works</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</a>
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

// Hero section
function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-32 pb-20 px-4 overflow-hidden">
      <GradientBackground />
      
      <div className="max-w-4xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-700 rounded-full text-sm font-medium mb-6"
        >
          <Sparkles className="w-4 h-4" />
          AI-Powered Learning Platform
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight"
        >
          Learn Any Skill
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-focus-500">
            in 7 Days
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto"
        >
          AI generates your personalized curriculum. 45 minutes a day. 
          Build real projects. Get an AI companion that actually helps.
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
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            leftIcon={<Play className="w-5 h-5" />}
          >
            See How It Works
          </Button>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-500"
        >
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {['😊', '🧑‍💻', '👩‍🎨', '🧑‍🔬'].map((emoji, i) => (
                <div
                  key={i}
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-gray-100 flex items-center justify-center text-lg border-2 border-white"
                >
                  {emoji}
                </div>
              ))}
            </div>
            <span>2,000+ learners</span>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            ))}
            <span className="ml-1">4.9/5 rating</span>
          </div>
        </motion.div>
      </div>

      {/* Hero visual */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-16 max-w-5xl mx-auto"
      >
        <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 ml-4 px-4 py-1 bg-white rounded-lg text-sm text-gray-400 text-center">
              flexforge.ai
            </div>
          </div>
          
          {/* App preview */}
          <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
            <div className="max-w-lg mx-auto text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center">
                <span className="text-4xl">🦊</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Hey there! I'm Flexi 👋</h3>
              <p className="text-gray-600 mb-6">What would you like to learn today?</p>
              <div className="bg-white rounded-xl shadow-lg p-6 text-left">
                <input
                  type="text"
                  placeholder="e.g., Build AI agents with Python"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400"
                  readOnly
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Python Basics', 'Web Dev', 'AI/ML', 'Data Science'].map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// Features section
function FeaturesSection() {
  const features = [
    {
      icon: Brain,
      title: 'AI-Generated Curriculum',
      description: 'Tell us what you want to learn. Our AI creates a personalized curriculum based on cognitive science research.',
      color: 'from-brand-500 to-brand-600',
    },
    {
      icon: Clock,
      title: '45 Minutes a Day',
      description: 'Structured daily sessions with video, active recall, coding tasks, and reflection. No fluff, just learning.',
      color: 'from-focus-500 to-emerald-500',
    },
    {
      icon: Trophy,
      title: 'Build Real Projects',
      description: 'Every 3-4 days, tackle a Boss Project that combines everything you learned. Build your portfolio as you go.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Zap,
      title: 'Flexi - Your AI Companion',
      description: 'An AI companion that celebrates your wins, helps when you\'re stuck, and makes learning feel less lonely.',
      color: 'from-alert-500 to-orange-500',
    },
  ];

  return (
    <section id="features" className="py-20 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Learning, Reimagined
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We combined cognitive science research with AI to create the most effective learning experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100"
            >
              <div className={clsx(
                'w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-6',
                feature.color
              )}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
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
      title: 'Tell us what to learn',
      description: 'Enter any skill - Python, guitar, cooking, AI agents. Our AI analyzes complexity and creates your path.',
    },
    {
      number: '02',
      title: 'Daily 45-min sessions',
      description: 'Watch a focused video, practice active recall, solve coding challenges, and reflect on your learning.',
    },
    {
      number: '03',
      title: 'Build Boss Projects',
      description: 'Every few days, combine your skills in a real project. Build your portfolio while you learn.',
    },
    {
      number: '04',
      title: 'Showcase your skills',
      description: 'Your skill tree grows. Your portfolio fills. Share your progress and land opportunities.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            How FlexForge Works
          </h2>
          <p className="text-xl text-gray-600">
            From zero to skilled in four simple steps
          </p>
        </div>

        <div className="space-y-12">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex gap-6 items-start"
            >
              <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-brand-600">{step.number}</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
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
        'AI-generated curriculum',
        'Daily learning sessions',
        'Basic hints & solutions',
        'Boss Projects',
        '1 active curriculum',
      ],
      cta: 'Start Free',
      popular: false,
    },
    {
      name: 'Pro',
      price: '$15',
      period: '/month',
      description: 'For serious learners',
      features: [
        'Everything in Free',
        'Flexi AI Tutor (20 msgs/day)',
        'AI code review',
        'The Vault (knowledge base)',
        'Personalized review schedule',
        '3 active curricula',
      ],
      cta: 'Start Pro Trial',
      popular: true,
    },
    {
      name: 'Premium',
      price: '$39',
      period: '/month',
      description: 'Maximum learning power',
      features: [
        'Everything in Pro',
        'Unlimited AI Tutor',
        'Adaptive difficulty',
        'Career path integration',
        'Priority support',
        'Unlimited curricula',
      ],
      cta: 'Go Premium',
      popular: false,
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
              className={clsx(
                'relative bg-white rounded-2xl p-8 shadow-lg',
                plan.popular && 'ring-2 ring-brand-500'
              )}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-500 text-white text-sm font-medium rounded-full">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                {plan.period && <span className="text-gray-500">{plan.period}</span>}
              </div>
              <p className="text-gray-600 mb-6">{plan.description}</p>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <CheckCircle className="w-5 h-5 text-focus-500 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.popular ? 'primary' : 'secondary'}
                className="w-full"
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
            Ready to learn something new?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Join thousands of learners who are building real skills with FlexForge.
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
            <a href="#" className="hover:text-white transition-colors">About</a>
            <a href="#" className="hover:text-white transition-colors">Blog</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
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
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
