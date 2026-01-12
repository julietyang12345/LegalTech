import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Calendar, Trophy, ChevronRight, Sparkles, Loader2, RefreshCw, Target, BookOpen, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { Button, Card, StreakBadge, ProgressBar, GeneratingScreen } from '@/components/common';
import { sessionService } from '@/services/sessionService';

// Loading steps for day content generation (~1 minute total)
const DAY_LOADING_STEPS = [
  { icon: Sparkles, text: 'Generating day content...', duration: 15000 },
  { icon: Target, text: 'Creating practice exercises...', duration: 15000 },
  { icon: BookOpen, text: 'Finding perfect video...', duration: 15000 },
  { icon: CheckCircle, text: 'Finalizing your lesson...', duration: 10000 },
];


// Yesterday's Fog - memory bridge before starting
function YesterdaysFog({ yesterdayTopic, question }: { yesterdayTopic: string; question: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Card className="border-l-4 border-l-brand-400 bg-brand-50/50">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🌫️</span>
          <h3 className="font-semibold text-gray-900">Yesterday's Fog</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Quick recall before we start:
        </p>
        <div className="bg-white rounded-lg p-4 border border-brand-200">
          <p className="text-gray-800 font-medium mb-2">
            Yesterday you learned about <span className="text-brand-600">{yesterdayTopic}</span>.
          </p>
          <p className="text-gray-700">{question}</p>
        </div>
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            Think for 5 seconds, then reveal answer →
          </button>
        )}
        {revealed && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-sm text-gray-600 italic"
          >
            ✓ Great! You've primed your brain. Let's build on that foundation today.
          </motion.p>
        )}
      </div>
    </Card>
  );
}

// Boss Project countdown
function BossProjectCountdown({ daysUntil, projectTitle, todayContribution }: {
  daysUntil: number;
  projectTitle: string;
  todayContribution: string;
}) {
  return (
    <Card variant="hover" className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-900">Boss Project Countdown</h3>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
            <span className="text-xl font-bold text-purple-600">{daysUntil}</span>
          </div>
          <div>
            <p className="font-medium text-gray-900">{projectTitle}</p>
            <p className="text-sm text-gray-500">days until Boss Day</p>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          <span className="font-medium text-purple-600">Today's milestone:</span>{' '}
          {todayContribution}
        </p>
      </div>
    </Card>
  );
}

// Session complete state
function SessionCompleteState({ nextDayTopic }: { nextDayTopic: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-12"
    >
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-focus-400 to-focus-500 
                      flex items-center justify-center">
        <span className="text-4xl">🎉</span>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">You crushed it today!</h2>
      <p className="text-gray-600 mb-8">
        Come back tomorrow for: <span className="font-medium text-brand-600">{nextDayTopic}</span>
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="secondary" leftIcon={<Calendar className="w-4 h-4" />}>
          Review today's notes
        </Button>
        <Button variant="secondary" leftIcon={<Trophy className="w-4 h-4" />}>
          Work on Boss Project
        </Button>
      </div>
      <p className="mt-8 text-sm text-gray-500">See you tomorrow! 👋</p>
    </motion.div>
  );
}

// No active session - prompt to create one
function NoSessionState() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-16"
    >
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 
                      flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-3">Ready to learn something new?</h2>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Start your learning journey with an AI-generated curriculum tailored just for you.
      </p>
      <Button
        size="xl"
        onClick={() => navigate('/start')}
        rightIcon={<ChevronRight className="w-5 h-5" />}
      >
        Create Your First Curriculum
      </Button>
    </motion.div>
  );
}

export function TodayPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    activeSession,
    fetchActiveSession,
    loadDayContentSplit,
    deleteSession,
    isLoading,
    isDayLoading,
    canStartDay,
  } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  // Handle regeneration - only available on Day 1
  const handleRegenerateCurriculum = async () => {
    if (!activeSession || activeSession.currentDay !== 1) return;

    setIsRegenerating(true);
    try {
      // 1. Mark the current variant as regenerated (negative signal for cache)
      if (activeSession.variantId) {
        await sessionService.markRegenerated(
          activeSession.variantId,
          activeSession.id
        );
      }

      // 2. Delete the current session
      await deleteSession(activeSession.id);

      // 3. Navigate back to start to create a new one
      navigate('/start');
    } catch (err) {
      console.error('Failed to regenerate:', err);
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    // Greet user when they arrive
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    if (hour >= 17) greeting = 'Good evening';

    addSystemMessage(
      `${greeting}, ${user?.name || 'friend'}! Ready to learn today?`,
      'welcoming'
    );
  }, [user?.name, addSystemMessage]);

  const handleStartSession = async () => {
    if (!activeSession) return;

    try {
      // Load core content first (fast), deferred loads in background
      await loadDayContentSplit(activeSession.currentDay);
      navigate(`/session/${activeSession.id}`);
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  // Check if current day can be started
  const canStart = activeSession ? canStartDay(activeSession.currentDay) : false;

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-40 bg-gray-200 rounded-xl" />
          <div className="h-32 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  // Day content generation loading screen
  if (isDayLoading && activeSession) {
    return (
      <GeneratingScreen
        steps={DAY_LOADING_STEPS}
        title={`Preparing Day ${activeSession.currentDay}`}
        subtitle={`Creating your ${activeSession.skillName} lesson`}
        timeEstimate="This usually takes about a minute"
      />
    );
  }

  // No session state
  if (!activeSession) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <NoSessionState />
      </div>
    );
  }

  // Get current day data
  const currentDayData = activeSession.curriculum.days.find(
    d => d.day === activeSession.currentDay
  );
  const previousDayData = activeSession.curriculum.days.find(
    d => d.day === activeSession.currentDay - 1
  );

  // Find next boss project
  const nextBoss = activeSession.curriculum.bossProjects?.find(
    b => b.day > activeSession.currentDay
  );
  const daysUntilBoss = nextBoss ? nextBoss.day - activeSession.currentDay : 0;

  // Check if today is complete (placeholder - would come from progress)
  const isTodayComplete = false;

  if (isTodayComplete) {
    const nextDayData = activeSession.curriculum.days.find(
      d => d.day === activeSession.currentDay + 1
    );
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <SessionCompleteState nextDayTopic={nextDayData?.title || 'More learning'} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Welcome header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="text-3xl">😊</span>
          <h1 className="text-2xl font-bold text-gray-900">
            Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.name || 'friend'}!
          </h1>
        </div>
        {user && user.currentStreak > 0 && (
          <StreakBadge count={user.currentStreak} animated />
        )}
      </motion.div>

      {/* Yesterday's Fog (skip on day 1) */}
      {previousDayData && activeSession.currentDay > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <YesterdaysFog
            yesterdayTopic={previousDayData.title.split(':')[1]?.trim() || 'yesterday\'s concept'}
            question={previousDayData.activeRecall?.part2?.connectionQuestion || 
              `How does ${previousDayData.title} connect to what you'll learn today?`}
          />
        </motion.div>
      )}

      {/* Today's Session Card - THE MAIN CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="bg-white border-2 border-brand-100">
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 text-brand-600 
                          rounded-full text-sm font-medium mb-4">
              <Calendar className="w-4 h-4" />
              Day {activeSession.currentDay} of {activeSession.durationDays}
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {currentDayData?.title || `Day ${activeSession.currentDay}`}
            </h2>

            {/* Show objectives or skeleton preview */}
            {currentDayData?.objectives && currentDayData.objectives.length > 0 ? (
              <p className="text-gray-600 mb-6">
                {currentDayData.objectives[0]}
              </p>
            ) : currentDayData?.skeleton?.videoDescription ? (
              <p className="text-gray-600 mb-6">
                {currentDayData.skeleton.videoDescription}
              </p>
            ) : (
              <p className="text-gray-600 mb-6">
                {currentDayData?.prePrompt?.primeQuestions?.[0] ||
                  'Ready to learn something new today?'}
              </p>
            )}

            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-6">
              <span>⏱️ ~{currentDayData?.estimatedMinutes || 45} minutes</span>
            </div>

            <Button
              size="xl"
              onClick={handleStartSession}
              disabled={isDayLoading || !canStart}
              leftIcon={isDayLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              className="w-full sm:w-auto"
            >
              {isDayLoading ? 'Generating Content...' : 'Start Session'}
            </Button>

            {!canStart && activeSession.currentDay > 1 && (
              <p className="mt-4 text-sm text-amber-600">
                Complete yesterday's practice project to unlock today's session.
              </p>
            )}

            {canStart && (
              <p className="mt-4 text-xs text-gray-400">
                Just one button. That's it.
              </p>
            )}

            {/* Generate New option - only on Day 1 */}
            {activeSession.currentDay === 1 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={handleRegenerateCurriculum}
                  disabled={isRegenerating || isDayLoading}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5 mx-auto
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isRegenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {isRegenerating ? 'Generating new curriculum...' : 'Not what you expected? Generate new'}
                </button>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Boss Project Countdown */}
      {nextBoss && daysUntilBoss <= 4 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <BossProjectCountdown
            daysUntil={daysUntilBoss}
            projectTitle={nextBoss.title}
            todayContribution={
              currentDayData?.bossMilestone?.description || 
              'Build foundations for your boss project'
            }
          />
        </motion.div>
      )}

      {/* Progress indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card padding="sm">
          <div className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Sprint Progress</span>
              <span className="text-sm text-gray-500">
                {Math.round((activeSession.currentDay / activeSession.durationDays) * 100)}%
              </span>
            </div>
            <ProgressBar
              value={activeSession.currentDay}
              max={activeSession.durationDays}
            />
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
