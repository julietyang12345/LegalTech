import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Sparkles, Zap, Target, BookOpen, Code2, Lightbulb, Puzzle, Rocket, Star } from 'lucide-react';

interface ExerciseLoadingScreenProps {
  type: 'task' | 'intensive' | 'quiz' | 'code';
  skillName?: string;
  dayNumber?: number;
}

// Fun loading messages by type
const LOADING_MESSAGES: Record<string, string[]> = {
  task: [
    'Crafting the perfect challenge for you...',
    'Preparing brain-boosting exercises...',
    'Loading knowledge nuggets...',
    'Mixing up some learning magic...',
    'Getting your exercises ready...',
  ],
  intensive: [
    'Preparing intensive practice session...',
    'Loading advanced exercises...',
    'Brewing up some challenging content...',
    'Assembling your training arena...',
    'Calibrating difficulty levels...',
  ],
  quiz: [
    'Shuffling question cards...',
    'Preparing your knowledge check...',
    'Loading quiz questions...',
    'Getting ready to test your skills...',
    'Assembling brain teasers...',
  ],
  code: [
    'Compiling your coding challenge...',
    'Preparing the sandbox environment...',
    'Loading code snippets...',
    'Setting up your dev playground...',
    'Initializing the code editor...',
  ],
};

// Fun facts to show while loading
const FUN_FACTS = [
  'Active recall improves retention by 50%',
  'Short practice sessions are more effective than long cramming',
  'Teaching others helps you learn better',
  'Taking breaks boosts your problem-solving ability',
  'Spaced repetition makes memories stick longer',
  'Mistakes are actually great for learning!',
  'Your brain grows new connections when you learn',
  'Curiosity enhances memory formation',
];

// Floating icon component
function FloatingIcon({
  icon: Icon,
  delay,
  duration,
  x,
  y
}: {
  icon: typeof Brain;
  delay: number;
  duration: number;
  x: number;
  y: number;
}) {
  return (
    <motion.div
      className="absolute text-brand-300/40"
      initial={{ opacity: 0, scale: 0, x, y }}
      animate={{
        opacity: [0, 0.6, 0.6, 0],
        scale: [0.5, 1.2, 1, 0.8],
        y: [y, y - 80, y - 120, y - 160],
        rotate: [0, 10, -10, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        repeatDelay: 2,
        ease: 'easeInOut',
      }}
    >
      <Icon className="w-6 h-6" />
    </motion.div>
  );
}

// Particle component
function Particle({ delay }: { delay: number }) {
  const randomX = useMemo(() => Math.random() * 200 - 100, []);
  const randomY = useMemo(() => Math.random() * 100 - 50, []);
  const size = useMemo(() => Math.random() * 6 + 2, []);

  return (
    <motion.div
      className="absolute rounded-full bg-gradient-to-r from-brand-400 to-purple-400"
      style={{ width: size, height: size }}
      initial={{ opacity: 0, x: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: [0, randomX * 0.5, randomX],
        y: [0, randomY - 30, randomY - 60],
        scale: [0, 1, 0.8, 0],
      }}
      transition={{
        duration: 2.5,
        delay,
        repeat: Infinity,
        repeatDelay: Math.random() * 2,
        ease: 'easeOut',
      }}
    />
  );
}

// Orbiting dot component
function OrbitingDot({ delay, radius, duration }: { delay: number; radius: number; duration: number }) {
  return (
    <motion.div
      className="absolute w-3 h-3 rounded-full bg-gradient-to-r from-brand-400 to-purple-500"
      style={{
        boxShadow: '0 0 10px rgba(139, 92, 246, 0.5)',
      }}
      animate={{
        rotate: 360,
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      <motion.div
        className="absolute w-3 h-3"
        style={{
          left: radius,
          top: 0,
        }}
      >
        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-brand-400 to-purple-500"
          style={{ boxShadow: '0 0 10px rgba(139, 92, 246, 0.5)' }}
        />
      </motion.div>
    </motion.div>
  );
}

// Main brain animation component
function BrainAnimation() {
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      {/* Outer glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Rotating ring */}
      <motion.div
        className="absolute w-28 h-28 rounded-full border-2 border-dashed border-brand-300/50"
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />

      {/* Counter-rotating ring */}
      <motion.div
        className="absolute w-24 h-24 rounded-full border-2 border-dotted border-purple-300/40"
        animate={{ rotate: -360 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />

      {/* Central icon container */}
      <motion.div
        className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg"
        style={{
          boxShadow: '0 10px 40px rgba(139, 92, 246, 0.4)',
        }}
        animate={{
          scale: [1, 1.05, 1],
          rotate: [0, 2, -2, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <motion.div
          animate={{
            y: [0, -3, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Brain className="w-10 h-10 text-white" />
        </motion.div>
      </motion.div>

      {/* Floating particles */}
      <div className="absolute inset-0 flex items-center justify-center">
        {[...Array(8)].map((_, i) => (
          <Particle key={i} delay={i * 0.3} />
        ))}
      </div>

      {/* Orbiting sparkles */}
      <motion.div
        className="absolute"
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      >
        <Sparkles className="w-4 h-4 text-yellow-400 absolute -top-8 left-1/2 -translate-x-1/2" />
      </motion.div>
      <motion.div
        className="absolute"
        animate={{ rotate: -360 }}
        transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
      >
        <Star className="w-3 h-3 text-purple-400 absolute -bottom-6 left-1/2 -translate-x-1/2" />
      </motion.div>
    </div>
  );
}

// Progress bar with shimmer effect
function ShimmerProgress({ progress }: { progress: number }) {
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full relative"
          style={{
            background: 'linear-gradient(90deg, #8b5cf6, #d946ef, #8b5cf6)',
            backgroundSize: '200% 100%',
          }}
          initial={{ width: '0%' }}
          animate={{
            width: `${progress}%`,
            backgroundPosition: ['0% 0%', '100% 0%'],
          }}
          transition={{
            width: { duration: 0.5 },
            backgroundPosition: { duration: 1.5, repeat: Infinity, ease: 'linear' },
          }}
        >
          {/* Shimmer overlay */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            }}
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}

export function ExerciseLoadingScreen({ type, skillName, dayNumber }: ExerciseLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const messages = LOADING_MESSAGES[type] || LOADING_MESSAGES.task;

  // Cycle through messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [messages.length]);

  // Cycle through fun facts
  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % FUN_FACTS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Simulate progress
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev; // Cap at 90% until actually loaded
        return prev + Math.random() * 15;
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const floatingIcons = [
    { icon: Lightbulb, x: -60, y: 20, delay: 0, duration: 3 },
    { icon: Puzzle, x: 60, y: -10, delay: 0.5, duration: 3.5 },
    { icon: Target, x: -50, y: -40, delay: 1, duration: 3.2 },
    { icon: Zap, x: 70, y: 30, delay: 1.5, duration: 2.8 },
    { icon: Code2, x: -70, y: 50, delay: 2, duration: 3.3 },
    { icon: Rocket, x: 50, y: -50, delay: 2.5, duration: 3.1 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-12 px-4 min-h-[400px]"
    >
      {/* Floating background icons */}
      <div className="relative mb-8">
        {floatingIcons.map((props, i) => (
          <FloatingIcon key={i} {...props} />
        ))}
        <BrainAnimation />
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center mb-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-1">
          {type === 'intensive' ? 'Intensive Practice' : 'Preparing Exercises'}
        </h2>
        {skillName && (
          <p className="text-gray-500 text-sm">
            {dayNumber ? `Day ${dayNumber} - ` : ''}{skillName}
          </p>
        )}
      </motion.div>

      {/* Animated message */}
      <div className="h-8 mb-6 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="text-brand-600 font-medium text-center"
          >
            {messages[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm mb-8">
        <ShimmerProgress progress={Math.min(progress, 90)} />
      </div>

      {/* Fun fact */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="max-w-sm text-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-full mb-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-medium text-purple-600">Did you know?</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={factIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-gray-500"
          >
            {FUN_FACTS[factIndex]}
          </motion.p>
        </AnimatePresence>
      </motion.div>

      {/* Decorative dots */}
      <div className="flex gap-2 mt-8">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-brand-400"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
