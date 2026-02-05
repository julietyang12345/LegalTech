import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Bookmark,
  GraduationCap,
  Trash2,
  Play,
  Calendar,
  Clock,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
  MoreVertical,
  X,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, Card, Input } from '@/components/common';
import { StepContentPreview, type PreviewStep } from '@/components/session';
import { sessionService } from '@/services/sessionService';
import { SessionStatus, type Session, type CurriculumDay, type TargetLanguage } from '@/types';

// Tab types
type VaultTab = 'courses' | 'bookmarks';

// Bookmark interface
export interface CourseBookmark {
  id: string;
  sessionId: string;
  skillName: string;
  dayNumber: number;
  section: 'video' | 'task1' | 'task2' | 'boss' | 'reflection';
  sectionTitle: string;
  note?: string;
  createdAt: string;
  // Content snapshots
  content?: {
    // Video content
    videoTitle?: string;
    videoDescription?: string;
    // Task content
    taskTitle?: string;
    taskDescription?: string;
    taskQuestions?: Array<{
      question: string;
      options?: string[];
      correctAnswer?: string;
    }>;
    // Boss milestone content
    bossTitle?: string;
    bossDescription?: string;
    bossRequirements?: string[];
    // Foundation cards
    foundationCards?: Array<{
      front: string;
      back: string;
    }>;
    // Reflection questions
    reflectionQuestions?: Array<{
      id: number;
      question: string;
    }>;
    // Open task content
    openTaskTitle?: string;
    openTaskDescription?: string;
    openTaskChallenge?: string;
    // Code snippet
    codeSnippet?: string;
  };
}

// Bookmark storage key
const BOOKMARKS_STORAGE_KEY = 'flexforge_bookmarks';

// Tab component
function TabButton({
  tab,
  activeTab,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  tab: VaultTab;
  activeTab: VaultTab;
  icon: typeof GraduationCap;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        activeTab === tab
          ? 'bg-brand-100 text-brand-700'
          : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
      {count !== undefined && count > 0 && (
        <span className={clsx(
          'px-1.5 py-0.5 text-xs rounded-full',
          activeTab === tab ? 'bg-brand-200 text-brand-800' : 'bg-gray-200 text-gray-600'
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// Status badge component
function StatusBadge({ status }: { status: SessionStatus }) {
  const config = {
    [SessionStatus.ACTIVE]: { icon: Play, color: 'bg-green-100 text-green-700', label: 'Active' },
    [SessionStatus.PAUSED]: { icon: PauseCircle, color: 'bg-yellow-100 text-yellow-700', label: 'Paused' },
    [SessionStatus.COMPLETED]: { icon: CheckCircle2, color: 'bg-blue-100 text-blue-700', label: 'Completed' },
    [SessionStatus.ABANDONED]: { icon: AlertCircle, color: 'bg-gray-100 text-gray-500', label: 'Abandoned' },
  };

  const { icon: Icon, color, label } = config[status] || config[SessionStatus.ACTIVE];

  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full', color)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// Session card component
function SessionCard({
  session,
  isActiveSession,
  onResume,
  onDelete,
}: {
  session: Session;
  isActiveSession: boolean;
  onResume: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const progress = Math.round((session.currentDay / session.durationDays) * 100);
  const startDate = new Date(session.startedAt).toLocaleDateString();

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
      setShowMenu(false);
    } else {
      setConfirmDelete(true);
    }
  };

  return (
    <Card variant="hover" className="p-4 relative">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-6 h-6 text-brand-600" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 truncate">{session.skillName}</h3>
              <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs sm:text-sm text-gray-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {startDate}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {session.durationDays} days
                </span>
              </div>
            </div>
            <div className="flex-shrink-0">
              <StatusBadge status={
                // Show actual status for active session or completed
                // All other sessions display as PAUSED on vault page
                isActiveSession || session.status === SessionStatus.COMPLETED
                  ? session.status
                  : SessionStatus.PAUSED
              } />
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Day {session.currentDay} of {session.durationDays}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-500 to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center justify-between">
            <Button
              size="sm"
              onClick={onResume}
              className="flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {session.status === SessionStatus.COMPLETED ? 'Review' : 'Resume'}
            </Button>

            {/* Menu button */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Dropdown menu */}
              <AnimatePresence>
                {showMenu && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => {
                        setShowMenu(false);
                        setConfirmDelete(false);
                      }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]"
                    >
                      <button
                        onClick={handleDelete}
                        className={clsx(
                          'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                          confirmDelete
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'text-red-600 hover:bg-red-50'
                        )}
                      >
                        <Trash2 className="w-4 h-4" />
                        {confirmDelete ? 'Confirm Delete' : 'Delete'}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Empty state component
function EmptyState({ icon: Icon, title, description }: { icon: typeof GraduationCap; title: string; description: string }) {
  return (
    <Card className="p-8 text-center">
      <Icon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </Card>
  );
}

// Get section icon and label
function getSectionInfo(section: CourseBookmark['section']) {
  const config = {
    video: { icon: Play, label: 'Video Lesson' },
    task1: { icon: BookOpen, label: 'Practice Task 1' },
    task2: { icon: BookOpen, label: 'Practice Task 2' },
    boss: { icon: GraduationCap, label: 'Boss Project' },
    reflection: { icon: BookOpen, label: 'Reflection' },
  };
  return config[section] || config.video;
}

// Bookmark card component
function BookmarkCard({
  bookmark,
  onClick,
  onDelete,
}: {
  bookmark: CourseBookmark;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { icon: Icon, label } = getSectionInfo(bookmark.section);
  const createdDate = new Date(bookmark.createdAt).toLocaleDateString();

  return (
    <Card
      variant="hover"
      className="p-4 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-gray-900">{bookmark.sectionTitle}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {bookmark.skillName} · Day {bookmark.dayNumber} · {label}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {bookmark.note && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{bookmark.note}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">{createdDate}</p>
        </div>
      </div>
    </Card>
  );
}

// Map bookmark section to preview step
function sectionToPreviewStep(section: CourseBookmark['section']): PreviewStep {
  const map: Record<CourseBookmark['section'], PreviewStep> = {
    video: 'video',
    task1: 'task1',
    task2: 'openTask',
    boss: 'bossMilestone',
    reflection: 'reflection',
  };
  return map[section] || 'overview';
}

// Bookmark detail modal
function BookmarkModal({
  bookmark,
  onClose,
  onResumeCourse,
  onDelete,
}: {
  bookmark: CourseBookmark;
  onClose: () => void;
  onResumeCourse: () => void;
  onDelete: () => void;
}) {
  const { icon: Icon, label } = getSectionInfo(bookmark.section);
  const createdDate = new Date(bookmark.createdAt).toLocaleDateString();

  // State for loading curriculum day data
  const [dayData, setDayData] = useState<CurriculumDay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage | undefined>();

  // Fetch curriculum day data on mount
  useEffect(() => {
    const fetchDayData = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        // Try to get full day details first (includes all task content)
        try {
          const dayDetails = await sessionService.getDayDetails(bookmark.sessionId, bookmark.dayNumber);
          if (dayDetails.day) {
            setDayData(dayDetails.day as CurriculumDay);
            // Get target language from session
            const sessionResponse = await sessionService.getById(bookmark.sessionId);
            setTargetLanguage(sessionResponse.session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined);
            return;
          }
        } catch {
          // Fall back to session data if getDayDetails fails
        }

        // Fallback: get day from session curriculum
        const response = await sessionService.getById(bookmark.sessionId);
        const session = response.session;
        const day = session.curriculum?.days?.find(d => d.day === bookmark.dayNumber);

        if (day) {
          setDayData(day);
          setTargetLanguage(session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined);
        } else {
          setLoadError('Day content not found');
        }
      } catch (err) {
        console.error('Failed to load bookmark content:', err);
        setLoadError('Failed to load content');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDayData();
  }, [bookmark.sessionId, bookmark.dayNumber]);

  const previewStep = sectionToPreviewStep(bookmark.section);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
              <Bookmark className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{bookmark.sectionTitle}</h2>
              <p className="text-sm text-gray-500">{bookmark.skillName} · Day {bookmark.dayNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Section type badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-100 text-brand-700 text-sm font-medium rounded-full">
              <Icon className="w-4 h-4" />
              {label}
            </span>
            <span className="text-xs text-gray-400">Bookmarked {createdDate}</span>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          )}

          {/* Error state */}
          {loadError && !isLoading && (
            <div className="text-center py-8 text-gray-500">
              <Bookmark className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>{loadError}</p>
            </div>
          )}

          {/* Task1 bookmark with specific questions - show only those */}
          {bookmark.section === 'task1' && bookmark.content?.taskQuestions && bookmark.content.taskQuestions.length > 0 && !isLoading && (
            <div className="space-y-4">
              {bookmark.content?.taskTitle && (
                <h3 className="font-semibold text-gray-900">{bookmark.content.taskTitle}</h3>
              )}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">
                  {bookmark.content.taskQuestions.length} bookmarked {bookmark.content.taskQuestions.length === 1 ? 'question' : 'questions'}
                </h4>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {bookmark.content.taskQuestions.map((q, i) => (
                    <div key={i} className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                      <p className="font-medium text-gray-900 mb-3">
                        {i + 1}. {q.question}
                      </p>
                      {q.options && (
                        <div className="space-y-2 ml-4">
                          {q.options.map((opt, j) => (
                            <div
                              key={j}
                              className={clsx(
                                'p-2 rounded-lg text-sm',
                                q.correctAnswer === opt
                                  ? 'bg-green-100 text-green-800 border border-green-200'
                                  : 'bg-gray-50 text-gray-600 border border-gray-100'
                              )}
                            >
                              {opt}
                              {q.correctAnswer === opt && (
                                <CheckCircle2 className="inline w-4 h-4 ml-2 text-green-600" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {bookmark.content?.codeSnippet && (
                <div className="rounded-lg overflow-hidden">
                  <div className="bg-gray-800 px-3 py-1.5 text-xs text-gray-400 font-mono">Code</div>
                  <pre className="bg-gray-900 p-3 text-xs text-gray-100 overflow-x-auto max-h-[200px]">
                    <code>{bookmark.content.codeSnippet}</code>
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Boss bookmark with stored content - show it directly */}
          {bookmark.section === 'boss' && !isLoading && (bookmark.content?.bossTitle || bookmark.content?.bossDescription) && (
            <div className="space-y-4">
              {bookmark.content?.bossTitle && (
                <h3 className="font-semibold text-gray-900">{bookmark.content.bossTitle}</h3>
              )}
              {bookmark.content?.bossDescription && (
                <p className="text-sm text-gray-600">{bookmark.content.bossDescription}</p>
              )}
              {bookmark.content?.bossRequirements && bookmark.content.bossRequirements.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Requirements</h4>
                  <ul className="space-y-1">
                    {bookmark.content.bossRequirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {bookmark.content?.codeSnippet && (
                <div className="rounded-lg overflow-hidden">
                  <div className="bg-gray-800 px-3 py-1.5 text-xs text-gray-400 font-mono">Starter Code</div>
                  <pre className="bg-gray-900 p-3 text-xs text-gray-100 overflow-x-auto max-h-[200px]">
                    <code>{bookmark.content.codeSnippet}</code>
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Boss bookmark without stored content - fall back to StepContentPreview */}
          {bookmark.section === 'boss' && !isLoading && !bookmark.content?.bossTitle && !bookmark.content?.bossDescription && dayData && (
            <StepContentPreview
              day={dayData}
              step={previewStep}
              targetLanguage={targetLanguage}
              maxHeight="400px"
            />
          )}

          {/* Task1 without specific questions OR other sections (video, reflection, etc.) - use StepContentPreview */}
          {((bookmark.section === 'task1' && (!bookmark.content?.taskQuestions || bookmark.content.taskQuestions.length === 0)) || (bookmark.section !== 'task1' && bookmark.section !== 'boss')) && dayData && !isLoading && (
            <StepContentPreview
              day={dayData}
              step={previewStep}
              targetLanguage={targetLanguage}
              maxHeight="400px"
            />
          )}

          {/* Fallback when dayData fails to load for sections that need it */}
          {(
            // Non-task1, non-boss sections need dayData
            (bookmark.section !== 'task1' && bookmark.section !== 'boss') ||
            // Boss without stored content also needs dayData
            (bookmark.section === 'boss' && !bookmark.content?.bossTitle && !bookmark.content?.bossDescription)
          ) && !dayData && !isLoading && !loadError && (
            <div className="text-center py-8">
              <Bookmark className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">Content not available. Resume the course to view this section.</p>
            </div>
          )}

          {/* User Note */}
          {bookmark.note && (
            <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <h4 className="text-sm font-medium text-yellow-800 mb-1">Your Note</h4>
              <p className="text-yellow-900">{bookmark.note}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
          <Button
            variant="secondary"
            onClick={onDelete}
            className="flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
          <Button
            onClick={onResumeCourse}
            className="flex-1 flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Resume This Course
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Bookmark storage helpers
function loadBookmarks(): CourseBookmark[] {
  try {
    const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: CourseBookmark[]) {
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
}


export function VaultPage() {
  const navigate = useNavigate();
  const { activeSession, setActiveSession, updateSession } = useSessionStore();
  const [activeTab, setActiveTab] = useState<VaultTab>('courses');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<CourseBookmark[]>([]);
  const [selectedBookmark, setSelectedBookmark] = useState<CourseBookmark | null>(null);
  const [sessionToResume, setSessionToResume] = useState<Session | null>(null);

  // Fetch sessions and bookmarks on mount
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setIsLoading(true);
        const response = await sessionService.getAll();
        setSessions(response.sessions);
      } catch (err: any) {
        setError(err.message || 'Failed to load sessions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
    setBookmarks(loadBookmarks());
  }, []);

  // Filter sessions by search query
  const filteredSessions = sessions.filter(session =>
    session.skillName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show confirmation dialog before resuming
  const handleResumeClick = (session: Session) => {
    // If this is already the active session, just navigate
    if (activeSession?.id === session.id) {
      navigate('/today');
      return;
    }
    // Show confirmation dialog
    setSessionToResume(session);
  };

  // Handle confirmed resume session
  const handleConfirmResume = async () => {
    if (!sessionToResume) return;

    try {
      // If there's a different active session, pause it first
      if (activeSession && activeSession.id !== sessionToResume.id) {
        await updateSession(activeSession.id, { status: SessionStatus.PAUSED });
      }

      // If this session is paused, set it to active in the backend
      if (sessionToResume.status === SessionStatus.PAUSED) {
        await updateSession(sessionToResume.id, { status: SessionStatus.ACTIVE });
      }

      // Fetch the full session data with curriculum
      const fullSessionResponse = await sessionService.getById(sessionToResume.id);
      const fullSession = fullSessionResponse.session;

      // Set as active session and navigate
      setActiveSession(fullSession);
      setSessionToResume(null);
      navigate('/today');
    } catch (err) {
      console.error('Failed to resume session:', err);
      setError('Failed to resume session. Please try again.');
      setSessionToResume(null);
    }
  };

  // Handle delete session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await sessionService.delete(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete session');
    }
  };

  // Handle delete bookmark
  const handleDeleteBookmark = (bookmarkId: string) => {
    const updated = bookmarks.filter(b => b.id !== bookmarkId);
    setBookmarks(updated);
    saveBookmarks(updated);
    setSelectedBookmark(null);
  };

  // Handle resume course from bookmark
  const handleResumeCourseFromBookmark = async (bookmark: CourseBookmark) => {
    try {
      // Fetch full session data with curriculum
      const response = await sessionService.getById(bookmark.sessionId);
      const session = response.session;

      // If there's a different active session, pause it first
      if (activeSession && activeSession.id !== session.id) {
        await updateSession(activeSession.id, { status: SessionStatus.PAUSED });
      }

      // If this session is paused, set it to active in the backend
      if (session.status === SessionStatus.PAUSED) {
        await updateSession(session.id, { status: SessionStatus.ACTIVE });
        // Refetch to get updated status
        const updatedResponse = await sessionService.getById(session.id);
        setActiveSession(updatedResponse.session);
      } else {
        setActiveSession(session);
      }

      setSelectedBookmark(null);
      navigate('/today');
    } catch {
      setError('Could not find the course for this bookmark');
      setSelectedBookmark(null);
    }
  };

  // Filter bookmarks by search query
  const filteredBookmarks = bookmarks.filter(bookmark =>
    bookmark.skillName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bookmark.sectionTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bookmark.note?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">The Vault</h1>
        <p className="text-gray-600">
          Your courses and knowledge base. Everything you've learned, organized and ready to review.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search your vault..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 overflow-x-auto pb-2">
        <TabButton
          tab="courses"
          activeTab={activeTab}
          icon={GraduationCap}
          label="My Courses"
          count={sessions.length}
          onClick={() => setActiveTab('courses')}
        />
        <TabButton
          tab="bookmarks"
          activeTab={activeTab}
          icon={Bookmark}
          label="Bookmarks"
          count={bookmarks.length}
          onClick={() => setActiveTab('bookmarks')}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        {/* My Courses Tab */}
        {activeTab === 'courses' && (
          <>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="p-4 animate-pulse">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gray-200" />
                      <div className="flex-1">
                        <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                        <div className="h-4 bg-gray-100 rounded w-1/4 mb-3" />
                        <div className="h-1.5 bg-gray-100 rounded-full" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredSessions.length > 0 ? (
              <div className="space-y-4">
                {filteredSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isActiveSession={activeSession?.id === session.id}
                    onResume={() => handleResumeClick(session)}
                    onDelete={() => handleDeleteSession(session.id)}
                  />
                ))}
              </div>
            ) : searchQuery ? (
              <EmptyState
                icon={Search}
                title="No courses found"
                description={`No courses match "${searchQuery}". Try a different search term.`}
              />
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="No courses yet"
                description="Start your first learning journey! Create a course from the home page."
              />
            )}

            {/* Create new course CTA */}
            {!isLoading && sessions.length > 0 && (
              <div className="text-center pt-4">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/start')}
                  className="inline-flex items-center gap-2"
                >
                  <GraduationCap className="w-4 h-4" />
                  Start New Course
                </Button>
              </div>
            )}
          </>
        )}

        {/* Bookmarks Tab */}
        {activeTab === 'bookmarks' && (
          <>
            {filteredBookmarks.length > 0 ? (
              <div className="space-y-3">
                {filteredBookmarks.map(bookmark => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    onClick={() => setSelectedBookmark(bookmark)}
                    onDelete={() => handleDeleteBookmark(bookmark.id)}
                  />
                ))}
              </div>
            ) : searchQuery ? (
              <EmptyState
                icon={Search}
                title="No bookmarks found"
                description={`No bookmarks match "${searchQuery}". Try a different search term.`}
              />
            ) : (
              <EmptyState
                icon={Bookmark}
                title="No bookmarks yet"
                description="Bookmark sections during your learning sessions to save them here for quick reference."
              />
            )}
          </>
        )}

      </motion.div>

      {/* Bookmark Modal */}
      <AnimatePresence>
        {selectedBookmark && (
          <BookmarkModal
            bookmark={selectedBookmark}
            onClose={() => setSelectedBookmark(null)}
            onResumeCourse={() => handleResumeCourseFromBookmark(selectedBookmark)}
            onDelete={() => handleDeleteBookmark(selectedBookmark.id)}
          />
        )}
      </AnimatePresence>

      {/* Resume Confirmation Modal */}
      <AnimatePresence>
        {sessionToResume && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setSessionToResume(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Switch Course?
              </h3>
              <p className="text-gray-600 mb-4">
                {activeSession ? (
                  <>
                    Your current course <span className="font-medium">{activeSession.skillName}</span> will be paused.
                    You can resume it anytime from the Vault.
                  </>
                ) : (
                  <>Resume <span className="font-medium">{sessionToResume.skillName}</span>?</>
                )}
              </p>
              <div className="flex items-center gap-3 justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSessionToResume(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmResume}
                  className="flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {sessionToResume.status === SessionStatus.COMPLETED ? 'Review' : 'Resume'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
