import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  ExternalLink,
  Github,
  Eye,
  Lock,
  Sparkles,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/authStore';
import { projectService } from '@/services/projectService';
import { sessionService } from '@/services/sessionService';
import { Button, Card } from '@/components/common';
import type { Project, Session } from '@/types';

// Skill progress derived from sessions
interface SkillProgress {
  name: string;
  status: 'complete' | 'progress' | 'locked';
  daysCompleted: number;
  totalDays: number;
  projects: number;
  sessionId?: string;
}

// Skill node for RPG tree
function SkillNode({
  name,
  status,
  projects,
  daysCompleted,
  totalDays,
  onClick,
}: {
  name: string;
  status: 'complete' | 'progress' | 'locked';
  projects: number;
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
        'w-24 h-24 rounded-xl flex flex-col items-center justify-center relative overflow-hidden',
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
      ) : projects > 0 ? (
        <span className="text-[10px] opacity-75">{projects} projects</span>
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

// Project card
function ProjectCard({ project }: { project: Project }) {
  return (
    <Card variant="hover" className="overflow-hidden">
      {/* Screenshot */}
      {project.screenshotUrl ? (
        <img
          src={project.screenshotUrl}
          alt={project.title}
          className="w-full h-40 object-cover"
        />
      ) : (
        <div className="w-full h-40 bg-gradient-to-br from-brand-100 to-brand-200 
                       flex items-center justify-center">
          <span className="text-4xl">🚀</span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-gray-900">{project.title}</h3>
          {project.isBossProject && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
              Boss
            </span>
          )}
        </div>

        {project.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {project.description}
          </p>
        )}

        {/* Skills tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {project.skillsTags?.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Links */}
        <div className="flex gap-2">
          {project.demoUrl && (
            <a
              href={project.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
            >
              <ExternalLink className="w-4 h-4" />
              Demo
            </a>
          )}
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700"
            >
              <Github className="w-4 h-4" />
              Code
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ShowcasePage() {
  const { user: _user } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [skills, setSkills] = useState<SkillProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'boss'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load projects and sessions in parallel
      const [projectsResponse, sessionsResponse] = await Promise.all([
        projectService.getAll(),
        sessionService.getAll(),
      ]);

      setProjects(projectsResponse.projects);
      setSessions(sessionsResponse.sessions);

      // Convert sessions to skill progress
      const skillProgress: SkillProgress[] = sessionsResponse.sessions.map((session) => {
        const isComplete = session.status === 'COMPLETED';
        const isInProgress = session.status === 'ACTIVE';

        // Count projects associated with this session's skill
        const sessionProjects = projectsResponse.projects.filter(
          p => p.sessionId === session.id
        ).length;

        return {
          name: session.skillName || 'Unknown Skill',
          status: isComplete ? 'complete' : isInProgress ? 'progress' : 'locked',
          daysCompleted: session.currentDay - 1, // currentDay is next day to work on
          totalDays: session.durationDays,
          projects: sessionProjects,
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

  const filteredProjects = activeFilter === 'boss'
    ? projects.filter(p => p.isBossProject)
    : projects;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Showcase</h1>
        <p className="text-gray-600">
          Your skills and projects in one place. Share your public profile to show what you've built.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column - Skill Tree */}
        <div className="lg:col-span-1 space-y-6">
          {/* RPG Skill Tree */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-brand-500" />
                <h2 className="font-semibold text-gray-900">Skill Tree</h2>
              </div>

              {/* Simple grid layout for skills */}
              <div className="grid grid-cols-2 gap-3">
                {skills.length === 0 && !isLoading ? (
                  <div className="col-span-2 text-center py-8 text-gray-500 text-sm">
                    Start a learning session to build your skill tree!
                  </div>
                ) : (
                  skills.map((skill, i) => (
                    <SkillNode
                      key={skill.sessionId || i}
                      name={skill.name}
                      status={skill.status}
                      projects={skill.projects}
                      daysCompleted={skill.daysCompleted}
                      totalDays={skill.totalDays}
                      onClick={() => {
                        if (skill.sessionId && skill.status === 'progress') {
                          window.location.href = '/today';
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

          {/* Public Profile Preview */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-5 h-5 text-gray-500" />
                <h3 className="font-semibold text-gray-900">Public Profile</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Share your learning journey and projects with the world.
              </p>
              <Button variant="secondary" size="sm" className="w-full">
                Preview Profile
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        </div>

        {/* Right column - Projects */}
        <div className="lg:col-span-2">
          {/* Filter tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveFilter('all')}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeFilter === 'all'
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              All Projects ({projects.length})
            </button>
            <button
              onClick={() => setActiveFilter('boss')}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeFilter === 'boss'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              Boss Projects ({projects.filter(p => p.isBossProject).length})
            </button>
          </div>

          {/* Projects grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-40 bg-gray-200 rounded-t-xl" />
                  <div className="p-4 bg-white rounded-b-xl shadow-card">
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-4 bg-gray-200 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <Card className="p-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No projects yet
              </h3>
              <p className="text-gray-600 mb-4">
                Complete your first learning session to start building your portfolio!
              </p>
              <Button onClick={() => window.location.href = '/today'}>
                Start Learning
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
