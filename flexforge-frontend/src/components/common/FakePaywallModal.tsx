import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Sparkles, Zap, Crown, Rocket, Users } from 'lucide-react';
import { Button } from './Button';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';

interface FakePaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  source?: 'showcase_ai' | 'rate_limit' | 'settings' | 'feature_gate';
}

// Plan comparison data
const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    features: {
      'AI-generated curriculum': true,
      'Daily learning sessions': true,
      'Boss Projects': true,
      'Active curricula': '1',
      'AI Skill Tree Analysis': '1/week',
      'Flexi AI Tutor': false,
      'AI code review': false,
      'The Vault (knowledge base)': false,
      'Personalized review': false,
      'Adaptive difficulty': false,
      'Priority support': false,
    },
  },
  {
    name: 'Pro',
    price: '$20',
    period: '/mo',
    popular: true,
    features: {
      'AI-generated curriculum': true,
      'Daily learning sessions': true,
      'Boss Projects': true,
      'Active curricula': '3',
      'AI Skill Tree Analysis': '1/day',
      'Flexi AI Tutor': '20 msgs/day',
      'AI code review': true,
      'The Vault (knowledge base)': true,
      'Personalized review': true,
      'Adaptive difficulty': false,
      'Priority support': false,
    },
  },
  {
    name: 'Premium',
    price: '$50',
    period: '/mo',
    features: {
      'AI-generated curriculum': true,
      'Daily learning sessions': true,
      'Boss Projects': true,
      'Active curricula': 'Unlimited',
      'AI Skill Tree Analysis': 'Unlimited',
      'Flexi AI Tutor': 'Unlimited',
      'AI code review': true,
      'The Vault (knowledge base)': true,
      'Personalized review': true,
      'Adaptive difficulty': true,
      'Priority support': true,
    },
  },
];

const featureOrder = [
  'AI-generated curriculum',
  'Daily learning sessions',
  'Boss Projects',
  'Active curricula',
  'AI Skill Tree Analysis',
  'Flexi AI Tutor',
  'AI code review',
  'The Vault (knowledge base)',
  'Personalized review',
  'Adaptive difficulty',
  'Priority support',
];

export function FakePaywallModal({ isOpen, onClose, source = 'feature_gate' }: FakePaywallModalProps) {
  const { user } = useAuthStore();
  const [email, setEmail] = useState(user?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(100);
  const [showPriceQuestion, setShowPriceQuestion] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  // Fetch waitlist count and reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSubmitted(false);
      setShowPriceQuestion(false);
      setSelectedPrice(null);

      // Fetch real waitlist count
      api.get('/waitlist/count')
        .then(res => setWaitlistCount(res.data.count || 100))
        .catch(() => setWaitlistCount(100)); // Fallback on error
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);

    try {
      const response = await api.post('/waitlist/signup', {
        email,
        source,
      });

      if (response.data.position) {
        setWaitlistCount(response.data.position);
      }
    } catch (error) {
      // Still show price question even if API fails
      console.error('Waitlist signup error:', error);
    }

    setIsSubmitting(false);
    setShowPriceQuestion(true);
  };

  const handlePriceSubmit = async () => {
    try {
      await api.post('/waitlist/price-preference', {
        email,
        pricePreference: selectedPrice,
      });
    } catch (error) {
      console.error('Price preference error:', error);
    }
    setIsSubmitted(true);
  };

  const handleSkipPrice = () => {
    setIsSubmitted(true);
  };

  const renderFeatureValue = (value: boolean | string) => {
    if (value === true) {
      return <Check className="w-4 h-4 text-green-500 mx-auto" />;
    }
    if (value === false) {
      return <X className="w-4 h-4 text-gray-300 mx-auto" />;
    }
    return <span className="text-sm font-medium text-gray-700">{value}</span>;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-brand-500 to-purple-600 p-6 text-white rounded-t-2xl">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Rocket className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Premium is Coming Soon!</h2>
                <p className="text-white/80 text-sm">Be first in line and save big</p>
              </div>
            </div>

            {/* Early Access Banner */}
            <div className="mt-4 p-3 bg-white/10 rounded-xl border border-white/20">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-300" />
                <span className="font-semibold">Early Access Offer: 50% off first 2 months!</span>
              </div>
              <p className="text-white/70 text-sm mt-1">
                Pro at $10/mo • Premium at $25/mo (then regular price)
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {!isSubmitted ? (
              <>
                {/* Comparison Table */}
                <div className="mb-8 overflow-x-auto">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Compare Plans</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 px-2 text-left text-gray-500 font-medium">Features</th>
                        {plans.map((plan) => (
                          <th key={plan.name} className="py-3 px-2 text-center min-w-[100px]">
                            <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              plan.name === 'Free' ? 'bg-gray-100 text-gray-600' :
                              plan.name === 'Pro' ? 'bg-brand-100 text-brand-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {plan.name}
                            </div>
                            <div className="mt-2">
                              <span className="text-xl font-bold text-gray-900">{plan.price}</span>
                              <span className="text-gray-500 text-xs">{plan.period}</span>
                            </div>
                            {plan.popular && (
                              <div className="mt-1 text-xs text-brand-600 font-medium">Most Popular</div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {featureOrder.map((feature, index) => (
                        <tr key={feature} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="py-2.5 px-2 text-gray-700">{feature}</td>
                          {plans.map((plan) => (
                            <td key={`${plan.name}-${feature}`} className="py-2.5 px-2 text-center">
                              {renderFeatureValue(plan.features[feature as keyof typeof plan.features])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Signup Form or Price Question */}
                {!showPriceQuestion ? (
                  <div className="bg-gradient-to-br from-brand-50 to-purple-50 rounded-xl p-6 border border-brand-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Join the Early Access List
                    </h3>
                    <p className="text-gray-600 text-sm mb-4">
                      Get notified when we launch + lock in your 50% discount for the first 2 months.
                    </p>

                    <form onSubmit={handleSubmit} className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        disabled={isSubmitting || !email}
                        className="whitespace-nowrap"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                            />
                            Joining...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Claim My Discount
                          </span>
                        )}
                      </Button>
                    </form>

                    {/* Social Proof */}
                    <div className="flex items-center gap-2 mt-4 text-sm text-gray-500">
                      <Users className="w-4 h-4" />
                      <span>Join <strong className="text-gray-700">{waitlistCount}</strong> learners waiting</span>
                      <span className="text-gray-300">•</span>
                      <span>No spam, just launch day</span>
                    </div>
                  </div>
                ) : (
                  /* Price Question */
                  <div className="bg-gradient-to-br from-brand-50 to-purple-50 rounded-xl p-6 border border-brand-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Thanks! One quick question
                    </h3>
                    <p className="text-gray-600 text-sm mb-4">
                      What price feels fair for unlimited AI-powered learning? (This helps us price fairly)
                    </p>

                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {['$10/mo', '$15/mo', '$20/mo', '$25+/mo'].map((price) => (
                        <button
                          key={price}
                          onClick={() => setSelectedPrice(price)}
                          className={`p-3 rounded-xl border-2 transition-all ${
                            selectedPrice === price
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <span className="font-semibold">{price}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={handlePriceSubmit}
                        disabled={!selectedPrice}
                        className="flex-1"
                      >
                        Submit
                      </Button>
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={handleSkipPrice}
                      >
                        Skip
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Thank You State */
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <Check className="w-10 h-10 text-green-600" />
                </motion.div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">You're on the list!</h3>
                <p className="text-gray-600 mb-4">
                  We'll email you at <strong>{email}</strong> when Premium launches.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-700 rounded-full text-sm font-medium">
                  <Sparkles className="w-4 h-4" />
                  50% off first 2 months secured!
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-3">Share with friends who'd love this:</p>
                  <div className="flex justify-center gap-2">
                    <button className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
                      Twitter
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                      LinkedIn
                    </button>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onClose}
                  className="mt-6"
                >
                  Continue Learning
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
