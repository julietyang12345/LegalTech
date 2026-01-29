import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  CheckCircle,
  PlayCircle,
  SkipForward,
  Circle,
  Trophy,
  Eye,
  Clock,
  Target,
  X,
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { DayStatus, type CurriculumDay } from '@/types';

interface CourseSidebarProps {
  onDayClick?: (dayNumber: number) => void;
}

// Preview modal for locked days
function DayPreviewModal({
  day,
  isOpen,
  onClose,
  clickY,
  sidebarCollapsed
}: {
  day: CurriculumDay | null;
  isOpen: boolean;
  onClose: () => void;
  clickY: number;
  sidebarCollapsed: boolean;
}) {
  if (!isOpen || !day) return null;

  // Calculate top position, ensuring modal stays within viewport
  const topPosition = Math.min(Math.max(clickY - 50, 70), window.innerHeight - 500);
  // Left position based on sidebar state
  const leftPosition = sidebarCollapsed ? 70 : 340;

  const topic = day.title?.includes(':')
    ? day.title.split(':')[1]?.trim()
    : day.title;

  // Get description from various possible sources
  const description = (day as any).description
    || (day as any).subtitle
    || (day as any).teaser
    || day.skeleton?.videoDescription;

  // Use createPortal to render modal at document body level but positioned near sidebar
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/30"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        className="absolute bg-white rounded-2xl w-full max-w-[420px] shadow-xl overflow-hidden max-h-[calc(100vh-100px)] overflow-y-auto left-0 right-0 mx-4 md:left-auto md:right-auto md:mx-0"
        style={{ top: topPosition, left: leftPosition }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-50 to-brand-100 p-4 border-b border-brand-200">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-brand-600 bg-brand-200/50 px-2 py-0.5 rounded-full">
                Day {day.day} Preview
              </span>
              <h3 className="text-lg font-semibold text-gray-900 mt-2">
                {topic || `Day ${day.day}`}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Day description */}
          {description && (
            <p className="text-sm text-gray-600 mt-2">
              {description}
            </p>
          )}

          {/* Time estimate */}
          {day.estimatedMinutes && (
            <div className="flex items-center gap-1.5 mt-3 text-sm text-gray-500">
              <Clock className="w-4 h-4 text-brand-500" />
              <span>~{day.estimatedMinutes} minutes</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Learning Objectives */}
          {day.objectives && day.objectives.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Target className="w-4 h-4 text-brand-500" />
                <span>What you'll learn</span>
              </div>
              <ul className="space-y-1.5">
                {day.objectives.map((objective, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-brand-400 mt-1">•</span>
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What you'll build (from skeleton) */}
          {day.skeleton && (day.skeleton.task1Preview || day.skeleton.practicePreview) && (
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>What you'll build</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 border border-gray-100">
                {day.skeleton.task1Preview || day.skeleton.practicePreview}
              </div>
            </div>
          )}

          {/* Video topic preview */}
          {day.skeleton?.videoTitle && (
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <PlayCircle className="w-4 h-4 text-red-500" />
                <span>Today's lesson</span>
              </div>
              <p className="text-sm text-gray-600">{day.skeleton.videoTitle}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 space-y-3">
          {/* Locked notice */}
          <p className="text-sm text-center text-gray-500">
            Complete previous days to unlock.
          </p>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

const STATUS_CONFIG: Record<DayStatus, { icon: React.ReactNode; dotColor: string; lineColor: string }> = {
  [DayStatus.LOCKED]: {
    icon: <Eye className="w-3.5 h-3.5" />,
    dotColor: 'bg-gray-100 text-gray-500 border-gray-300 hover:border-brand-300 hover:bg-brand-50',
    lineColor: 'bg-gray-200'
  },
  [DayStatus.UNLOCKABLE]: {
    icon: <Circle className="w-3.5 h-3.5" />,
    dotColor: 'bg-white text-brand-500 border-brand-400 border-2',
    lineColor: 'bg-gray-200'
  },
  [DayStatus.IN_PROGRESS]: {
    icon: <PlayCircle className="w-3.5 h-3.5" />,
    dotColor: 'bg-brand-500 text-white border-brand-500',
    lineColor: 'bg-brand-500'
  },
  [DayStatus.COMPLETED]: {
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    dotColor: 'bg-green-500 text-white border-green-500',
    lineColor: 'bg-green-500'
  },
  [DayStatus.SKIPPED]: {
    icon: <SkipForward className="w-3.5 h-3.5" />,
    dotColor: 'bg-amber-400 text-white border-amber-400',
    lineColor: 'bg-amber-400'
  },
};

function TimelineDot({ status, isActive, hasBoss }: { status: DayStatus; isActive: boolean; hasBoss?: boolean }) {
  const config = STATUS_CONFIG[status];

  return (
    <motion.div
      className={clsx(
        'relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all z-10',
        config.dotColor,
        isActive && 'ring-4 ring-brand-100 scale-110'
      )}
      animate={isActive ? { scale: [1, 1.1, 1] } : {}}
      transition={{ repeat: isActive ? Infinity : 0, duration: 2 }}
    >
      {config.icon}
      {hasBoss && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
          <Trophy className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </motion.div>
  );
}

function DayItem({
  day,
  isActive,
  isLast,
  onClick,
  onPreviewClick,
  hasBoss
}: {
  day: CurriculumDay;
  isActive: boolean;
  isLast: boolean;
  onClick?: () => void;
  onPreviewClick?: (e: React.MouseEvent) => void;
  hasBoss?: boolean;
}) {
  const status = day.status || DayStatus.LOCKED;
  const isLocked = status === DayStatus.LOCKED;
  const config = STATUS_CONFIG[status];

  // Extract topic from title
  const topic = day.title?.includes(':')
    ? day.title.split(':')[1]?.trim()
    : day.title;

  const handleClick = (e: React.MouseEvent) => {
    if (isLocked) {
      onPreviewClick?.(e);
    } else {
      onClick?.();
    }
  };

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector line */}
      {!isLast && (
        <div
          className={clsx(
            'absolute left-4 top-8 w-0.5 h-[calc(100%-8px)] -translate-x-1/2',
            config.lineColor
          )}
        />
      )}

      {/* Timeline dot */}
      <TimelineDot status={status} isActive={isActive} hasBoss={hasBoss} />

      {/* Content card */}
      <motion.button
        onClick={(e) => handleClick(e)}
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
        className={clsx(
          'flex-1 text-left p-3 rounded-xl transition-all mb-2',
          'border cursor-pointer',
          status === DayStatus.LOCKED && 'border-gray-200 bg-gray-50/80 hover:bg-gray-100 hover:border-brand-200',
          status === DayStatus.UNLOCKABLE && 'border-brand-200 bg-brand-50/50 hover:bg-brand-50',
          status === DayStatus.IN_PROGRESS && 'border-brand-300 bg-brand-50 shadow-sm',
          status === DayStatus.COMPLETED && 'border-green-200 bg-green-50/50 hover:bg-green-50',
          status === DayStatus.SKIPPED && 'border-amber-200 bg-amber-50/50 hover:bg-amber-50',
          isActive && 'shadow-md'
        )}
      >
        {/* Day number badge */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className={clsx(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              status === DayStatus.LOCKED && 'bg-gray-100 text-gray-500',
              status === DayStatus.UNLOCKABLE && 'bg-brand-100 text-brand-600',
              status === DayStatus.IN_PROGRESS && 'bg-brand-200 text-brand-700',
              status === DayStatus.COMPLETED && 'bg-green-100 text-green-700',
              status === DayStatus.SKIPPED && 'bg-amber-100 text-amber-700',
            )}>
              Day {day.day}
            </span>
            {isLocked && (
              <span className="flex items-center gap-0.5 text-xs text-gray-400">
                <Eye className="w-3 h-3" />
                <span>Preview</span>
              </span>
            )}
          </div>
          {day.estimatedMinutes && (
            <span className="text-xs text-gray-400">
              {day.estimatedMinutes}m
            </span>
          )}
        </div>

        {/* Title */}
        <h4 className={clsx(
          'font-medium text-sm leading-snug',
          status === DayStatus.LOCKED ? 'text-gray-600' : 'text-gray-900'
        )}>
          {topic || `Day ${day.day}`}
        </h4>

        {/* Subtitle/Teaser */}
        {((day as any).subtitle || (day as any).teaser) && (
          <p className={clsx(
            'text-xs mt-1 line-clamp-2',
            status === DayStatus.LOCKED ? 'text-gray-400' : 'text-gray-500'
          )}>
            {(day as any).subtitle || (day as any).teaser}
          </p>
        )}

        {/* Skills */}
        {(day as any).skills && (day as any).skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(day as any).skills.slice(0, 3).map((skill: string, i: number) => (
              <span
                key={i}
                className={clsx(
                  'text-xs px-1.5 py-0.5 rounded-md',
                  status === DayStatus.LOCKED
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-white/80 text-gray-600 border border-gray-200'
                )}
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </motion.button>
    </div>
  );
}

export function CourseSidebar({ onDayClick }: CourseSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [previewDay, setPreviewDay] = useState<CurriculumDay | null>(null);
  const [previewClickY, setPreviewClickY] = useState(0);

  const { activeSession, currentDay } = useSessionStore();

  const handlePreviewClick = (day: CurriculumDay, e: React.MouseEvent) => {
    setPreviewDay(day);
    setPreviewClickY(e.clientY);
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active day
  useEffect(() => {
    if (currentDay && scrollRef.current) {
      const activeElement = scrollRef.current.querySelector(`[data-day="${currentDay.day}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentDay?.day]);

  if (!activeSession) return null;

  const days = activeSession.curriculum.days || [];
  const bossProjectDays = new Set(
    activeSession.curriculum.bossProjects?.map(b => b.day) || []
  );

  const completedCount = days.filter(d =>
    d.status === DayStatus.COMPLETED || d.status === DayStatus.SKIPPED
  ).length;

  const progressPercent = (completedCount / days.length) * 100;

  return (
    <motion.aside
      initial={{ width: isCollapsed ? 56 : 320 }}
      animate={{ width: isCollapsed ? 56 : 320 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={clsx(
        'fixed left-0 top-14 bottom-0 bg-white/95 backdrop-blur-sm border-r border-gray-200 z-20',
        'hidden md:flex flex-col shadow-sm'
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={clsx(
          'absolute -right-3 top-6 z-30',
          'w-6 h-6 rounded-full bg-white border border-gray-200 shadow-md',
          'flex items-center justify-center',
          'hover:bg-gray-50 hover:scale-110 transition-all'
        )}
      >
        <motion.div
          animate={{ rotate: isCollapsed ? 0 : 180 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </motion.div>
      </button>

      <AnimatePresence mode="wait">
        {isCollapsed ? (
          // Collapsed: Mini timeline
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center pt-6 gap-1 overflow-y-auto scrollbar-hide"
          >
            {days.map((day, index) => {
              const isActive = currentDay?.day === day.day;
              const status = day.status || DayStatus.LOCKED;
              const isLast = index === days.length - 1;
              const config = STATUS_CONFIG[status];
              const hasBoss = bossProjectDays.has(day.day);

              return (
                <div key={day.day} className="relative flex flex-col items-center">
                  {/* Connector */}
                  {!isLast && (
                    <div className={clsx('absolute top-8 w-0.5 h-4', config.lineColor)} />
                  )}

                  <motion.button
                    onClick={(e) => {
                      if (status === DayStatus.LOCKED) {
                        handlePreviewClick(day, e);
                      } else {
                        onDayClick?.(day.day);
                      }
                    }}
                    whileHover={{ scale: 1.2 }}
                    className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                      'border-2 transition-all relative cursor-pointer',
                      config.dotColor,
                      isActive && 'ring-4 ring-brand-100'
                    )}
                    title={status === DayStatus.LOCKED ? `Preview: ${day.title}` : day.title}
                  >
                    {day.day}
                    {hasBoss && (
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full flex items-center justify-center">
                        <Trophy className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </motion.button>
                </div>
              );
            })}
          </motion.div>
        ) : (
          // Expanded: Full sidebar
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full"
          >
            {/* Header with skill name and progress */}
            <div className="p-4 border-b border-gray-100">
              {/* Skill name card */}
              <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl p-3 mb-3 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-white text-sm leading-tight line-clamp-2">
                      {activeSession.skillName}
                    </h2>
                    <p className="text-brand-100 text-xs mt-0.5">
                      {activeSession.durationDays} days
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500 font-medium">Progress</span>
                  <span className="font-semibold text-brand-600">
                    {completedCount}/{days.length}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>

            {/* Scrollable days list */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
            >
              {days.map((day, index) => (
                <div key={day.day} data-day={day.day}>
                  <DayItem
                    day={day}
                    isActive={currentDay?.day === day.day}
                    isLast={index === days.length - 1}
                    onClick={() => onDayClick?.(day.day)}
                    onPreviewClick={(e) => handlePreviewClick(day, e)}
                    hasBoss={activeSession.curriculum.metadata?.isProjectBased !== false && bossProjectDays.has(day.day)}
                  />
                </div>
              ))}
            </div>

            {/* Footer - only show boss project info for project-based curricula */}
            {activeSession.curriculum.metadata?.isProjectBased !== false && bossProjectDays.size > 0 && (
              <div className="p-3 border-t border-gray-100 bg-gray-50/80">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span>
                    Boss Projects: Days {Array.from(bossProjectDays).join(', ')}
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Modal for locked days */}
      <DayPreviewModal
        day={previewDay}
        isOpen={previewDay !== null}
        onClose={() => setPreviewDay(null)}
        clickY={previewClickY}
        sidebarCollapsed={isCollapsed}
      />
    </motion.aside>
  );
}
