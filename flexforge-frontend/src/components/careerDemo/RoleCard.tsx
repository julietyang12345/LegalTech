import { motion } from 'framer-motion';
import {
  Briefcase,
  Search,
  GitBranch,
  BarChart3,
  Clock,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { RoleSimulation } from '@/data/careerPathsRoles';

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase,
  Search,
  GitBranch,
  BarChart3,
};

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  brand: {
    bg: 'bg-brand-50 dark:bg-brand-900/20',
    text: 'text-brand-600 dark:text-brand-400',
    border: 'border-brand-200 dark:border-brand-800',
    badge: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
};

interface RoleCardProps {
  role: RoleSimulation;
  isCompleted: boolean;
  onStart: () => void;
  index: number;
}

export function RoleCard({ role, isCompleted, onStart, index }: RoleCardProps) {
  const Icon = ICON_MAP[role.icon] || Briefcase;
  const colors = COLOR_MAP[role.colorClass] || COLOR_MAP.brand;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={clsx(
        'relative rounded-xl border bg-surface shadow-card overflow-hidden transition-shadow hover:shadow-lg',
        isCompleted ? 'border-green-200 dark:border-green-800' : colors.border
      )}
    >
      {isCompleted && (
        <div className="absolute top-3 right-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
        </div>
      )}

      <div className="p-5">
        {/* Icon + Company */}
        <div className="flex items-start gap-3 mb-3">
          <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', colors.bg)}>
            <Icon className={clsx('w-5 h-5', colors.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-content">{role.role}</h3>
            <p className="text-xs text-content-tertiary">{role.company.name}</p>
          </div>
        </div>

        {/* Company type */}
        <p className="text-sm text-content-secondary mb-3">{role.company.type}</p>

        {/* Task preview */}
        <p className="text-sm text-content-secondary mb-4 line-clamp-2">
          {role.brief.deliverable}
        </p>

        {/* Skill tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {role.skillTags.slice(0, 3).map((tag) => (
            <span key={tag} className={clsx('px-2 py-0.5 text-xs font-medium rounded-full', colors.badge)}>
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-content-tertiary">
            <Clock className="w-3.5 h-3.5" />
            ~{role.estimatedMinutes} min
          </span>
          <button
            onClick={onStart}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              isCompleted
                ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                : `${colors.text} hover:${colors.bg}`
            )}
          >
            {isCompleted ? 'Redo' : 'Start Simulation'}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
