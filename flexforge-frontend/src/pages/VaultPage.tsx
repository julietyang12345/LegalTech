import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Search,
  Bookmark,
  Code,
  FileText,
  Brain,
  Crown,
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
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, Card, Input } from '@/components/common';
import { sessionService } from '@/services/sessionService';
import { QuotaTier, SessionStatus, type Session } from '@/types';

// Tab types
type VaultTab = 'courses' | 'summaries' | 'bookmarks' | 'code' | 'reflections' | 'review';

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
  icon: typeof BookOpen;
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
  onResume,
  onDelete,
}: {
  session: Session;
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
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900 truncate">{session.skillName}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
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
            <StatusBadge status={session.status} />
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
function EmptyState({ icon: Icon, title, description }: { icon: typeof BookOpen; title: string; description: string }) {
  return (
    <Card className="p-8 text-center">
      <Icon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </Card>
  );
}

// Paywall component for PRO features
function ProPaywall({ feature }: { feature: string }) {
  return (
    <Card className="p-8 text-center bg-gradient-to-br from-brand-50 to-purple-50">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
        <Crown className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Unlock {feature}</h2>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        This feature is available for PRO users. Upgrade to access AI-summarized content,
        saved snippets, and spaced repetition review.
      </p>
      <Button>Upgrade to PRO - $15/mo</Button>
    </Card>
  );
}

export function VaultPage() {
  const navigate = useNavigate();
  const { hasTierAccess } = useAuthStore();
  const { setActiveSession } = useSessionStore();
  const [activeTab, setActiveTab] = useState<VaultTab>('courses');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasProAccess = hasTierAccess(QuotaTier.PRO);

  // Fetch sessions on mount
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
  }, []);

  // Filter sessions by search query
  const filteredSessions = sessions.filter(session =>
    session.skillName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle resume session
  const handleResumeSession = async (session: Session) => {
    try {
      // Set this session as active
      setActiveSession(session);
      navigate('/session');
    } catch (err) {
      console.error('Failed to resume session:', err);
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
          tab="summaries"
          activeTab={activeTab}
          icon={FileText}
          label="Summaries"
          onClick={() => setActiveTab('summaries')}
        />
        <TabButton
          tab="bookmarks"
          activeTab={activeTab}
          icon={Bookmark}
          label="Bookmarks"
          onClick={() => setActiveTab('bookmarks')}
        />
        <TabButton
          tab="code"
          activeTab={activeTab}
          icon={Code}
          label="Code Snippets"
          onClick={() => setActiveTab('code')}
        />
        <TabButton
          tab="reflections"
          activeTab={activeTab}
          icon={BookOpen}
          label="Reflections"
          onClick={() => setActiveTab('reflections')}
        />
        <TabButton
          tab="review"
          activeTab={activeTab}
          icon={Brain}
          label="Review Queue"
          onClick={() => setActiveTab('review')}
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
                    onResume={() => handleResumeSession(session)}
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

        {/* Summaries Tab - PRO feature */}
        {activeTab === 'summaries' && (
          hasProAccess ? (
            <EmptyState
              icon={FileText}
              title="No summaries yet"
              description="AI-generated summaries from your video lessons will appear here."
            />
          ) : (
            <ProPaywall feature="Summaries" />
          )
        )}

        {/* Bookmarks Tab */}
        {activeTab === 'bookmarks' && (
          <EmptyState
            icon={Bookmark}
            title="No bookmarks yet"
            description="Bookmark video moments during your sessions to save them here."
          />
        )}

        {/* Code Snippets Tab - PRO feature */}
        {activeTab === 'code' && (
          hasProAccess ? (
            <EmptyState
              icon={Code}
              title="No code snippets yet"
              description="Save code snippets from your practice projects to reference later."
            />
          ) : (
            <ProPaywall feature="Code Snippets" />
          )
        )}

        {/* Reflections Tab */}
        {activeTab === 'reflections' && (
          <EmptyState
            icon={BookOpen}
            title="No reflections yet"
            description="Your daily reflections from completed sessions will appear here."
          />
        )}

        {/* Review Queue Tab - PRO feature */}
        {activeTab === 'review' && (
          hasProAccess ? (
            <EmptyState
              icon={Brain}
              title="Review queue empty"
              description="Complete more lessons to build your spaced repetition review queue."
            />
          ) : (
            <ProPaywall feature="Spaced Repetition Review" />
          )
        )}
      </motion.div>
    </div>
  );
}
