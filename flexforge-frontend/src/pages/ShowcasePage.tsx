import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { sessionService } from '@/services/sessionService';
import { authService } from '@/services/authService';
import { Button, Card } from '@/components/common';
import { SkillTreeCanvas } from '@/components/showcase';
import { useAuthStore } from '@/stores/authStore';
import { QuotaTier, UserRole } from '@/types';

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
  const isAdmin = user?.role === UserRole.ADMIN;
  const [skills, setSkills] = useState<SkillProgress[]>([]);
  const [plannedSkills, setPlannedSkills] = useState<PlannedSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
              onStartLearning={(skill) => navigate(`/plan?skill=${encodeURIComponent(skill)}`)}
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
    </div>
  );
}
