import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  ArrowRight,
  Sparkles,
  X,
  AlertCircle,
  BookOpen,
  Clock,
} from 'lucide-react';
import { sessionService } from '@/services/sessionService';
import { authService } from '@/services/authService';
import { Button, Card } from '@/components/common';
import { SkillTreeCanvas } from '@/components/showcase';
import { useAuthStore } from '@/stores/authStore';
import { QuotaTier, UserRole } from '@/types';

// Storage key for new course rate limiting
const NEW_COURSE_USAGE_KEY = 'flexforge-new-course-usage';

interface NewCourseUsage {
  lastStarted: string; // ISO date string
  count: number;
}

function getNewCourseUsage(): NewCourseUsage | null {
  try {
    const stored = localStorage.getItem(NEW_COURSE_USAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function recordNewCourseStart(): void {
  const now = new Date().toISOString();
  const existing = getNewCourseUsage();
  const today = new Date().toDateString();
  const lastDay = existing ? new Date(existing.lastStarted).toDateString() : null;

  localStorage.setItem(NEW_COURSE_USAGE_KEY, JSON.stringify({
    lastStarted: now,
    count: today === lastDay ? (existing?.count || 0) + 1 : 1,
  }));
}

function canStartNewCourse(isPro: boolean, isPremium: boolean, isAdmin: boolean = false): {
  allowed: boolean;
  reason?: string;
  limit?: string;
  remaining?: number;
} {
  // Admin or Premium users: unlimited
  if (isPremium || isAdmin) {
    return { allowed: true, limit: 'Unlimited courses' };
  }

  const usage = getNewCourseUsage();
  const now = new Date();

  if (!usage) {
    return {
      allowed: true,
      limit: isPro ? '3 courses/day' : '1 course/week',
      remaining: isPro ? 3 : 1,
    };
  }

  const lastStarted = new Date(usage.lastStarted);

  if (isPro) {
    // Pro: 3 courses per day
    const sameDay = now.toDateString() === lastStarted.toDateString();
    if (!sameDay) {
      return { allowed: true, limit: '3 courses/day', remaining: 3 };
    }
    if (usage.count >= 3) {
      return {
        allowed: false,
        reason: 'Daily limit reached. Try again tomorrow!',
        limit: '3 courses/day',
        remaining: 0,
      };
    }
    return { allowed: true, limit: '3 courses/day', remaining: 3 - usage.count };
  }

  // Free: 1 course per week
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const timeSinceStart = now.getTime() - lastStarted.getTime();
  if (timeSinceStart < weekMs) {
    const daysRemaining = Math.ceil((weekMs - timeSinceStart) / (24 * 60 * 60 * 1000));
    return {
      allowed: false,
      reason: `You can start a new course in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`,
      limit: '1 course/week',
      remaining: 0,
    };
  }

  return { allowed: true, limit: '1 course/week', remaining: 1 };
}

// Skill progress derived from sessions
interface SkillProgress {
  name: string;
  status: 'complete' | 'progress' | 'locked' | 'planned';
  daysCompleted: number;
  totalDays: number;
  sessionId?: string;
  icon?: string;
}

// Planned skill from API
interface PlannedSkill {
  skill: string;
  icon: string;
  addedAt: string;
}

export function ShowcasePage() {
  const navigate = useNavigate();
  const { hasTierAccess, user } = useAuthStore();
  const isPro = hasTierAccess(QuotaTier.PRO);
  const isPremium = hasTierAccess(QuotaTier.PREMIUM);
  const isAdmin = user?.role === UserRole.ADMIN || user?.quotaTier === QuotaTier.UNLIMITED;
  const [skills, setSkills] = useState<SkillProgress[]>([]);
  const [plannedSkills, setPlannedSkills] = useState<PlannedSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Confirmation modal state
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [selectedSkillToStart, setSelectedSkillToStart] = useState<string | null>(null);
  const courseRateLimit = canStartNewCourse(isPro, isPremium, isAdmin);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sessionsResponse, plannedResponse] = await Promise.all([
        sessionService.getAll(),
        authService.getPlannedSkills(),
      ]);

      // Convert sessions to skill progress
      const skillProgress: SkillProgress[] = sessionsResponse.sessions.map((session) => {
        const isComplete = session.status === 'COMPLETED';
        const isInProgress = session.status === 'ACTIVE';

        return {
          name: session.skillName || 'Unknown Skill',
          status: isComplete ? 'complete' : isInProgress ? 'progress' : 'locked',
          daysCompleted: session.currentDay - 1,
          totalDays: session.durationDays,
          sessionId: session.id,
        };
      });

      setSkills(skillProgress);
      setPlannedSkills(plannedResponse.plannedSkills || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlannedSkill = async (skill: string, icon: string) => {
    try {
      const result = await authService.addPlannedSkill(skill, icon);
      setPlannedSkills(result.plannedSkills);
    } catch (error) {
      console.error('Failed to add planned skill:', error);
    }
  };

  const handleRemovePlannedSkill = async (skill: string) => {
    try {
      const result = await authService.removePlannedSkill(skill);
      setPlannedSkills(result.plannedSkills);
    } catch (error) {
      console.error('Failed to remove planned skill:', error);
    }
  };

  // Combine actual skills with planned skills for the tree
  const allSkillsForTree: SkillProgress[] = [
    ...skills,
    ...plannedSkills
      .filter(p => !skills.some(s => s.name.toLowerCase() === p.skill.toLowerCase()))
      .map(p => ({
        name: p.skill,
        status: 'planned' as const,
        daysCompleted: 0,
        totalDays: 5,
        icon: p.icon,
      })),
  ];

  const hasAccess = isPro || isPremium;

  const handleSkillClick = (sessionId: string, status?: string) => {
    if (status === 'planned') {
      // Navigate to plan page to start learning
      const skill = allSkillsForTree.find(s => s.sessionId === sessionId || s.name === sessionId);
      if (skill) {
        navigate(`/plan?skill=${encodeURIComponent(skill.name)}`);
      }
    } else {
      navigate('/session');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Showcase</h1>
        <p className="text-gray-600">
          Track your learning journey. Select skills to discover combo project ideas!
        </p>
      </div>

      <div className="space-y-6">
        {/* Interactive Skill Tree Canvas */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-brand-500" />
            <h2 className="font-semibold text-gray-900">Your Skill Tree</h2>
          </div>

          {isLoading ? (
            <Card className="h-[500px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500">Loading your skills...</p>
              </div>
            </Card>
          ) : skills.length === 0 ? (
            <Card className="h-[300px] flex items-center justify-center">
              <div className="text-center">
                <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 mb-2">No skills yet</h3>
                <p className="text-gray-500 mb-4">Start a learning session to build your skill tree!</p>
                <Button onClick={() => navigate('/plan')}>
                  Start Learning
                </Button>
              </div>
            </Card>
          ) : (
            <SkillTreeCanvas
              skills={allSkillsForTree}
              onSkillClick={handleSkillClick}
              hasAccess={hasAccess}
              isPremium={isPremium}
              isAdmin={isAdmin}
              plannedSkills={plannedSkills}
              onAddPlannedSkill={handleAddPlannedSkill}
              onRemovePlannedSkill={handleRemovePlannedSkill}
              onStartLearning={(skill) => {
                setSelectedSkillToStart(skill);
                setShowStartConfirm(true);
              }}
            />
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-500" />
                Complete
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-purple-500" />
                In Progress
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border-2 border-dashed border-blue-400 bg-blue-50" />
                Planned
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Click skills for AI analysis • Check ✓ for combos
            </p>
          </div>
        </div>

        {/* CTA to Community */}
        <Card className="p-6 text-center">
          <Users className="w-10 h-10 mx-auto text-brand-500 mb-3" />
          <h3 className="font-semibold text-gray-900 mb-2">Join the Community</h3>
          <p className="text-sm text-gray-600 mb-4">
            Share your projects, ask questions, and connect with other learners.
          </p>
          <Button onClick={() => navigate('/community')} className="inline-flex items-center gap-2">
            Explore Community
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Card>
      </div>

      {/* Start Learning Confirmation Modal */}
      <AnimatePresence>
        {showStartConfirm && selectedSkillToStart && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowStartConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Start New Course?</h3>
                <button
                  onClick={() => setShowStartConfirm(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="space-y-4">
                {/* Skill preview */}
                <div className="p-4 bg-gradient-to-br from-brand-50 to-purple-50 rounded-xl border border-brand-200">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{selectedSkillToStart}</p>
                      <p className="text-sm text-gray-500">New learning journey</p>
                    </div>
                  </div>
                </div>

                {/* Rate limit info */}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {courseRateLimit.limit}
                    {courseRateLimit.remaining !== undefined && courseRateLimit.remaining > 0 && (
                      <span className="text-brand-600 ml-1">
                        ({courseRateLimit.remaining} remaining)
                      </span>
                    )}
                  </span>
                </div>

                {/* Rate limit warning */}
                {!courseRateLimit.allowed && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Limit Reached</p>
                      <p className="text-xs text-amber-600 mt-0.5">{courseRateLimit.reason}</p>
                      {!isPro && (
                        <button
                          onClick={() => navigate('/settings?tab=subscription')}
                          className="text-xs text-brand-600 hover:text-brand-700 mt-2 font-medium"
                        >
                          Upgrade to Pro for more courses →
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Info text */}
                {courseRateLimit.allowed && (
                  <p className="text-sm text-gray-500">
                    You'll be guided through setting up your personalized learning path for <strong>{selectedSkillToStart}</strong>.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => setShowStartConfirm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (courseRateLimit.allowed) {
                      recordNewCourseStart();
                      navigate(`/onboarding?skill=${encodeURIComponent(selectedSkillToStart)}`);
                    }
                  }}
                  disabled={!courseRateLimit.allowed}
                  className="flex-1"
                >
                  <Sparkles className="w-4 h-4" />
                  Start Learning
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
