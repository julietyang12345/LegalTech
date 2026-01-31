import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Users,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { sessionService } from '@/services/sessionService';
import { Button, Card } from '@/components/common';
import { SkillTreeCanvas } from '@/components/showcase';

// Skill progress derived from sessions
interface SkillProgress {
  name: string;
  status: 'complete' | 'progress' | 'locked';
  daysCompleted: number;
  totalDays: number;
  sessionId?: string;
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
    { skill: 'React', capability: 'Build interactive UIs' },
    { skill: 'Python', capability: 'Automate tasks & build backends' },
    { skill: 'JavaScript', capability: 'Add interactivity to websites' },
    { skill: 'TypeScript', capability: 'Write type-safe code' },
    { skill: 'Node', capability: 'Build server-side applications' },
    { skill: 'CSS', capability: 'Style beautiful interfaces' },
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
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unlockedCapabilities.map((cap, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2 text-gray-700"
              >
                <span className="w-2 h-2 rounded-full bg-focus-500 flex-shrink-0" />
                {cap.capability}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function ShowcasePage() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<SkillProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const sessionsResponse = await sessionService.getAll();

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

  const handleSkillClick = (_sessionId: string) => {
    navigate('/session');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Showcase</h1>
        <p className="text-gray-600">
          Track your learning journey. Drag skills to organize them into groups!
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
            <SkillTreeCanvas skills={skills} onSkillClick={handleSkillClick} />
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
                <span className="w-3 h-3 rounded bg-gray-300" />
                Locked
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Right-click to add groups | Drag to rearrange | Double-click to open
            </p>
          </div>
        </div>

        {/* What You Can Build */}
        <WhatYouCanBuild skills={unlockedSkills} />

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
