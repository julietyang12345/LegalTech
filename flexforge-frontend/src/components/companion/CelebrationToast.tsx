import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import Confetti from 'react-confetti';

interface CelebrationToastProps {
  message: string;
  mood: 'celebration' | 'encouragement' | 'support';
  duration?: number;
  showConfetti?: boolean;
  onClose?: () => void;
}

export function CelebrationToast({
  message,
  mood,
  duration = 4000,
  showConfetti = false,
  onClose,
}: CelebrationToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  // Initialize with window dimensions directly (safe because this is a client-side component)
  const [windowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const gradients = {
    celebration: 'from-pink-500 to-purple-500',
    encouragement: 'from-alert-500 to-yellow-500',
    support: 'from-cyan-500 to-blue-500',
  };

  const emojis = {
    celebration: '🎉',
    encouragement: '💪',
    support: '💙',
  };

  return (
    <>
      {showConfetti && isVisible && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={200}
          gravity={0.3}
        />
      )}
      
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 z-50"
          >
            <div
              className={clsx(
                'flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg',
                'bg-gradient-to-r text-white',
                gradients[mood]
              )}
            >
              <span className="text-2xl">{emojis[mood]}</span>
              <p className="font-medium">{message}</p>
              
              {/* Progress bar showing time remaining */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 rounded-b-xl overflow-hidden">
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: duration / 1000, ease: 'linear' }}
                  className="h-full bg-white/50"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Hook for showing celebrations
export function useCelebration() {
  const [toast, setToast] = useState<{
    message: string;
    mood: 'celebration' | 'encouragement' | 'support';
    showConfetti: boolean;
  } | null>(null);

  const celebrate = (
    message: string,
    mood: 'celebration' | 'encouragement' | 'support' = 'celebration',
    showConfetti = false
  ) => {
    setToast({ message, mood, showConfetti });
  };

  const clear = () => setToast(null);

  return {
    toast,
    celebrate,
    clear,
    CelebrationComponent: toast ? (
      <CelebrationToast
        message={toast.message}
        mood={toast.mood}
        showConfetti={toast.showConfetti}
        onClose={clear}
      />
    ) : null,
  };
}
