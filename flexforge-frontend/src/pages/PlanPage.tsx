import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Play,
  Check,
  Lock,
  Pause,
  Zap,
  Clock,
  Archive,
  Plus,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, ProgressBar } from '@/components/common';
import { SessionMode, QuotaTier } from '@/types';

// Day card in timeline
function DayCard({
  day,
  dayData,
  isComplete,
  isCurrent,
  isLocked,
  onExpand,
  isExpanded,
}: {
  day: number;
  dayData: any;
  isComplete: boolean;
  isCurrent: boolean;
  isLocked: boolean;
  onExpand: () => void;
  isExpanded: boolean;
}) {
  return (
    <Card
      variant={isCurrent ? 'active' : 'default'}
      className={clsx(
        'transition-all duration-200 cursor-pointer',
        isLocked && 'opacity-60',
        isCurrent && 'ring-2 ring-brand-200'
      )}
      onClick={onExpand}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Status icon */}
            <div
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center',
                isComplete && 'bg-focus-500 text-white',
                isCurrent && !isComplete && 'bg-brand-500 text-white',
                isLocked && 'bg-gray-200 text-gray-400'
              )}
            >
              {isComplete ? (
                <Check className="w-5 h-5" />
              ) : isLocked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <span className="font-semibold">{day}</span>
              )}
            </div>

            {/* Day info */}
            <div>
              <h3 className="font-medium text-gray-900">
                Day {day}: {dayData?.title?.split(':')[1]?.trim() || 'Loading...'}
              </h3>
              <p className="text-sm text-gray-500">
                ~{dayData?.estimatedMinutes || 45} min
              </p>
            </div>
          </div>

          {/* Expand chevron */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-gray-400" />
          </motion.div>
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 mt-4 border-t border-gray-100 space-y-3">
                {/* Topics */}
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Today's topics:</p>
                  <ul className="space-y-1">
                    <li className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                      {dayData?.video?.title || 'Video lesson'}
                    </li>
                    <li className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                      {dayData?.task1?.title || 'Coding task'}
                    </li>
                    <li className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                      {dayData?.practiceProject?.title || 'Practice project'}
                    </li>
                  </ul>
                </div>

                {/* Boss milestone if present */}
                {dayData?.bossMilestone && (
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm font-medium text-purple-700 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Boss Milestone: {dayData.bossMilestone.description}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

// Life Happens Modal
function LifeHappensModal({
  isOpen,
  onClose,
  onSelectMode,
  currentMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: SessionMode) => void;
  currentMode: SessionMode;
}) {
  if (!isOpen) return null;

  const modes = [
    {
      mode: SessionMode.SPRINT,
      icon: Zap,
      title: 'Sprint Mode',
      description: 'Condense the remaining days. Core concepts only, practice tasks go to Backlog.',
      color: 'from-alert-500 to-orange-500',
    },
    {
      mode: SessionMode.EXTENDED,
      icon: Clock,
      title: 'Extend Mode',
      description: 'Add extra days for more practice. Take your time to master each concept.',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      mode: SessionMode.PAUSED,
      icon: Pause,
      title: 'Pause',
      description: 'Take a break. Your progress is saved. 5-min review when you return.',
      color: 'from-gray-500 to-gray-600',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl"
      >
        <h2 className="text-xl font-bold text-gray-900 mb-2">Life Happens 💙</h2>
        <p className="text-gray-600 mb-6">
          No guilt here. Choose how you'd like to adjust your learning pace.
        </p>

        <div className="space-y-3">
          {modes.map(({ mode, icon: Icon, title, description, color }) => (
            <button
              key={mode}
              onClick={() => {
                onSelectMode(mode);
                onClose();
              }}
              className={clsx(
                'w-full p-4 rounded-xl border-2 text-left transition-all',
                currentMode === mode
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={clsx('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center', color)}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-600">{description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => onSelectMode(SessionMode.NORMAL)}>
            Back to Normal
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Backlog drawer
function BacklogDrawer({ isOpen, onClose, tasks }: {
  isOpen: boolean;
  onClose: () => void;
  tasks: string[];
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-white shadow-xl z-50 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-gray-600" />
                <h2 className="font-semibold text-gray-900">Backlog</h2>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                ×
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No tasks in backlog. Tasks moved here during Sprint Mode will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task, i) => (
                  <li key={i} className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                    {task}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function PlanPage() {
  const navigate = useNavigate();
  const { activeSession, updateSession, fetchActiveSession } = useSessionStore();
  const { hasTierAccess } = useAuthStore();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [showLifeHappens, setShowLifeHappens] = useState(false);
  const [showBacklog, setShowBacklog] = useState(false);

  useEffect(() => {
    if (!activeSession) {
      fetchActiveSession();
    }
  }, [activeSession, fetchActiveSession]);

  const handleModeChange = async (mode: SessionMode) => {
    if (!activeSession) return;
    await updateSession(activeSession.id, { mode });
  };

  if (!activeSession) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card className="p-8 text-center">
          <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Active Curriculum</h2>
          <p className="text-gray-600 mb-6">
            Create a curriculum to see your learning timeline here.
          </p>
          <Button onClick={() => navigate('/start')} leftIcon={<Plus className="w-4 h-4" />}>
            Create Curriculum
          </Button>
        </Card>
      </div>
    );
  }

  const { curriculum, currentDay } = activeSession;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Learning Plan</h1>
          <p className="text-gray-600">{activeSession.skillName}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowBacklog(true)}
            leftIcon={<Archive className="w-4 h-4" />}
          >
            Backlog
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLifeHappens(true)}
          >
            Life Happens
          </Button>
        </div>
      </div>

      {/* Progress overview */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Overall Progress</span>
            <span className="text-sm text-gray-500">
              Day {currentDay} of {activeSession.durationDays}
            </span>
          </div>
          <ProgressBar value={currentDay} max={activeSession.durationDays} />
          {activeSession.mode !== SessionMode.NORMAL && (
            <p className="mt-2 text-sm text-alert-600">
              📍 Currently in {activeSession.mode} mode
            </p>
          )}
        </div>
      </Card>

      {/* Timeline */}
      <div className="space-y-3">
        {curriculum.days.map((dayData, index) => {
          const day = index + 1;
          const isComplete = day < currentDay;
          const isCurrent = day === currentDay;
          const isLocked = day > currentDay;

          return (
            <DayCard
              key={day}
              day={day}
              dayData={dayData}
              isComplete={isComplete}
              isCurrent={isCurrent}
              isLocked={isLocked}
              isExpanded={expandedDay === day}
              onExpand={() => setExpandedDay(expandedDay === day ? null : day)}
            />
          );
        })}

        {/* Boss Projects */}
        {curriculum.bossProjects.map((boss) => (
          <Card
            key={`boss-${boss.day}`}
            className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200"
          >
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 
                               flex items-center justify-center text-white">
                  🏆
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Boss Project: {boss.title}</h3>
                  <p className="text-sm text-gray-600">
                    Day {boss.day} • Combines days {boss.combinesDays.join(', ')}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create new curriculum button (if PRO+) */}
      {hasTierAccess(QuotaTier.PRO) && (
        <div className="mt-8 pt-8 border-t border-gray-200">
          <Button
            variant="ghost"
            onClick={() => navigate('/start')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Another Curriculum
          </Button>
        </div>
      )}

      {/* Modals */}
      <LifeHappensModal
        isOpen={showLifeHappens}
        onClose={() => setShowLifeHappens(false)}
        onSelectMode={handleModeChange}
        currentMode={activeSession.mode}
      />

      <BacklogDrawer
        isOpen={showBacklog}
        onClose={() => setShowBacklog(false)}
        tasks={[]} // Would come from session state
      />
    </div>
  );
}
