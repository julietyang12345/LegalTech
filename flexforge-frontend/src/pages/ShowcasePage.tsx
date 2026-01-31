import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  Sparkles,
  Zap,
  Users,
  Target,
  Brain,
  Rocket,
  ArrowRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { sessionService } from '@/services/sessionService';
import { Button, Card } from '@/components/common';
import type { Session } from '@/types';

// Skill progress derived from sessions
interface SkillProgress {
  name: string;
  status: 'complete' | 'progress' | 'locked';
  daysCompleted: number;
  totalDays: number;
  sessionId?: string;
}

// Skill node for RPG tree
function SkillNode({
  name,
  status,
  daysCompleted,
  totalDays,
  onClick,
}: {
  name: string;
  status: 'complete' | 'progress' | 'locked';
  daysCompleted?: number;
  totalDays?: number;
  onClick: () => void;
}) {
  const statusStyles = {
    complete: 'bg-focus-500 text-white border-focus-400',
    progress: 'bg-brand-100 text-brand-700 border-brand-300',
    locked: 'bg-gray-100 text-gray-400 border-gray-200',
  };

  const progressPercent = totalDays && totalDays > 0
    ? Math.round((daysCompleted || 0) / totalDays * 100)
    : 0;

  return (
    <motion.button
      whileHover={{ scale: status !== 'locked' ? 1.05 : 1 }}
      whileTap={{ scale: status !== 'locked' ? 0.95 : 1 }}
      onClick={onClick}
      disabled={status === 'locked'}
      className={clsx(
        'w-full aspect-square rounded-xl flex flex-col items-center justify-center relative overflow-hidden',
        'border-2 transition-all duration-200',
        statusStyles[status],
        status !== 'locked' && 'cursor-pointer hover:shadow-lg'
      )}
    >
      {/* Progress bar background for in-progress skills */}
      {status === 'progress' && totalDays && (
        <div
          className="absolute bottom-0 left-0 h-1 bg-brand-500 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      {status === 'locked' ? (
        <Lock className="w-6 h-6 mb-1" />
      ) : status === 'complete' ? (
        <span className="text-2xl mb-1">✓</span>
      ) : (
        <span className="text-2xl mb-1">🔨</span>
      )}
      <span className="text-xs font-medium text-center px-1 leading-tight">{name}</span>
      {status === 'progress' && totalDays ? (
        <span className="text-[10px] opacity-75">Day {daysCompleted}/{totalDays}</span>
      ) : status === 'complete' && totalDays ? (
        <span className="text-[10px] opacity-75">{totalDays} days</span>
      ) : null}
    </motion.button>
  );
}

// "What You Can Build Now" section
function WhatYouCanBuild({ skills }: { skills: string[] }) {
  const capabilities = [
    { skill: 'Variables', capability: 'Store and manage data' },
    { skill: 'Functions', capability: 'Write reusable code blocks' },
    { skill: 'Loops', capability: 'Automate repetitive tasks' },
    { skill: 'APIs', capability: 'Connect to external services' },
    { skill: 'Databases', capability: 'Store data permanently' },
    { skill: 'AI Integration', capability: 'Add AI to your apps' },
  ];

  const unlockedCapabilities = capabilities.filter(c =>
    skills.some(s => c.skill.toLowerCase().includes(s.toLowerCase()) ||
                    s.toLowerCase().includes(c.skill.toLowerCase()))
  );

  return (
    <Card className="bg-gradient-to-br from-focus-50 to-emerald-50 border border-focus-200">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-focus-600" />
          <h3 className="font-semibold text-gray-900">What You Can Build Now</h3>
        </div>

        {unlockedCapabilities.length === 0 ? (
          <p className="text-gray-600 text-sm">
            Complete your first session to unlock capabilities!
          </p>
        ) : (
          <ul className="space-y-2">
            {unlockedCapabilities.map((cap, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-2 text-gray-700"
              >
                <span className="w-2 h-2 rounded-full bg-focus-500" />
                {cap.capability}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// Vision card component
function VisionCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof Target;
  title: string;
  description: string;
  status: 'live' | 'building' | 'planned';
}) {
  const statusStyles = {
    live: 'bg-green-100 text-green-700',
    building: 'bg-yellow-100 text-yellow-700',
    planned: 'bg-gray-100 text-gray-500',
  };

  const statusLabels = {
    live: 'Live',
    building: 'Building',
    planned: 'Planned',
  };

  return (
    <Card variant="hover" className="p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <span className={clsx('px-2 py-0.5 text-xs font-medium rounded-full', statusStyles[status])}>
              {statusLabels[status]}
            </span>
          </div>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
    </Card>
  );
}

export function ShowcasePage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [skills, setSkills] = useState<SkillProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const sessionsResponse = await sessionService.getAll();
      setSessions(sessionsResponse.sessions);

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
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const unlockedSkills = skills
    .filter(s => s.status !== 'locked')
    .map(s => s.name);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Showcase</h1>
        <p className="text-gray-600">
          Track your learning journey and see what we're building together.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column - Skill Tree */}
        <div className="space-y-6">
          {/* RPG Skill Tree */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-brand-500" />
                <h2 className="font-semibold text-gray-900">Your Skill Tree</h2>
              </div>

              {/* Simple grid layout for skills */}
              <div className="grid grid-cols-3 gap-3">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
                  ))
                ) : skills.length === 0 ? (
                  <div className="col-span-3 text-center py-8 text-gray-500 text-sm">
                    Start a learning session to build your skill tree!
                  </div>
                ) : (
                  skills.map((skill, i) => (
                    <SkillNode
                      key={skill.sessionId || i}
                      name={skill.name}
                      status={skill.status}
                      daysCompleted={skill.daysCompleted}
                      totalDays={skill.totalDays}
                      onClick={() => {
                        if (skill.sessionId && skill.status === 'progress') {
                          navigate('/session');
                        }
                      }}
                    />
                  ))
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-focus-500" />
                    Complete
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-brand-200" />
                    In Progress
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-gray-200" />
                    Locked
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* What You Can Build */}
          <WhatYouCanBuild skills={unlockedSkills} />
        </div>

        {/* Right column - What We're Building */}
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-200">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Rocket className="w-5 h-5 text-brand-600" />
                <h2 className="font-semibold text-gray-900">What We're Building</h2>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                FlexForge is an AI-powered learning platform that creates personalized
                curricula to help you master any skill through structured daily sessions,
                curated videos, and hands-on projects.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-white/50 rounded text-xs text-gray-600">AI Curriculum</span>
                <span className="px-2 py-1 bg-white/50 rounded text-xs text-gray-600">Video Learning</span>
                <span className="px-2 py-1 bg-white/50 rounded text-xs text-gray-600">Boss Projects</span>
                <span className="px-2 py-1 bg-white/50 rounded text-xs text-gray-600">Skill Tree</span>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 px-1">Our Roadmap</h3>

            <VisionCard
              icon={Target}
              title="Personalized Learning Paths"
              description="AI-generated curricula tailored to your goals, skill level, and available time."
              status="live"
            />

            <VisionCard
              icon={Brain}
              title="AI Tutor"
              description="Get help when you're stuck with context-aware explanations and hints."
              status="live"
            />

            <VisionCard
              icon={Users}
              title="Learning Community"
              description="Join topic-based groups, share your projects, ask questions, and learn together."
              status="building"
            />
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
    </div>
  );
}
