import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import {
  Trophy, Twitter, Linkedin, Copy, Share2, CheckCircle, Loader2,
} from 'lucide-react';
import { AchievementCard } from './AchievementCard';
import { buildShareText, shareNative, shareToTwitter, shareToLinkedIn, copyShareText } from '@/utils/socialShare';
import type { Session, CurriculumDay, User } from '@/types';

interface DayCompletionScreenProps {
  session: Session;
  currentDay: CurriculumDay;
  user: User;
  onContinue: () => Promise<void>;
  isLoading: boolean;
}

export function DayCompletionScreen({
  session,
  currentDay,
  user,
  onContinue,
  isLoading,
}: DayCompletionScreenProps) {
  const [copied, setCopied] = useState(false);
  const [windowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));

  const isCourseComplete = currentDay.day >= session.durationDays;
  const shareText = buildShareText(session, currentDay);

  const handleCopy = async () => {
    const ok = await copyShareText(shareText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-b from-gray-900/95 to-gray-800/95"
    >
      <Confetti
        width={windowSize.width}
        height={windowSize.height}
        recycle={false}
        numberOfPieces={isCourseComplete ? 500 : 300}
        gravity={0.2}
      />

      <div className="min-h-full flex items-center justify-center">
        <div className="relative z-10 w-full max-w-md mx-auto px-4 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key="celebration"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-6"
            >
              {/* Trophy */}
              <motion.div
                initial={{ scale: 0, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30"
              >
                <Trophy className="w-10 h-10 text-white" />
              </motion.div>

              {/* Title */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-center"
              >
                <h1 className="text-2xl font-bold text-white">
                  {isCourseComplete
                    ? 'Course Complete!'
                    : `Day ${currentDay.day} Complete!`}
                </h1>
                {isCourseComplete && (
                  <p className="text-purple-300 mt-1">
                    You finished all {session.durationDays} days. Amazing!
                  </p>
                )}
              </motion.div>

              {/* Achievement card */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.55 }}
                className="w-full"
              >
                <AchievementCard session={session} currentDay={currentDay} user={user} />
              </motion.div>

              {/* Share buttons */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="flex items-center gap-3"
              >
                <ShareButton
                  icon={<Twitter className="w-4 h-4" />}
                  label="Tweet"
                  onClick={() => shareToTwitter(shareText)}
                />
                <ShareButton
                  icon={<Linkedin className="w-4 h-4" />}
                  label="LinkedIn"
                  onClick={() => shareToLinkedIn(shareText)}
                />
                <ShareButton
                  icon={copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  label={copied ? 'Copied!' : 'Copy'}
                  onClick={handleCopy}
                />
                {typeof navigator !== 'undefined' && !!navigator.share && (
                  <ShareButton
                    icon={<Share2 className="w-4 h-4" />}
                    label="Share"
                    onClick={() => shareNative(shareText)}
                  />
                )}
              </motion.div>

              {/* Action button */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85 }}
                onClick={onContinue}
                disabled={isLoading}
                className="w-full max-w-xs py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 disabled:opacity-60 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving progress...
                  </>
                ) : isCourseComplete ? (
                  'View Your Results'
                ) : (
                  'Continue to Tomorrow'
                )}
              </motion.button>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   Small reusable components
   ═══════════════════════════════════════════════════ */

function ShareButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
