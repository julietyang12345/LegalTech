import { motion } from 'framer-motion';
import { ArrowRight, Building2, MessageSquare, Mail, User } from 'lucide-react';
import { Button } from '@/components/common';
import type { RoleSimulation } from '@/data/careerPathsRoles';

interface CompanyBriefProps {
  role: RoleSimulation;
  onStartTask: () => void;
}

export function CompanyBrief({ role, onStartTask }: CompanyBriefProps) {
  const { company, brief } = role;
  const ChannelIcon = brief.channel === 'slack' ? MessageSquare : Mail;
  const channelLabel = brief.channel === 'slack' ? 'Slack message' : 'Email';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      {/* Company context */}
      <div className="bg-surface rounded-xl shadow-card p-5 mb-4 border border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-surface-tertiary flex items-center justify-center">
            <Building2 className="w-4.5 h-4.5 text-content-secondary" />
          </div>
          <div>
            <h3 className="font-semibold text-content">{company.name}</h3>
            <p className="text-xs text-content-tertiary">{company.type} · {company.industry}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-content-secondary">
          <User className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
          <span>{company.yourRole}</span>
        </div>
      </div>

      {/* Manager message */}
      <div className="bg-surface rounded-xl shadow-card overflow-hidden mb-6 border border-border">
        <div className="px-5 py-3 border-b border-border bg-surface-secondary flex items-center gap-2">
          <ChannelIcon className="w-4 h-4 text-content-tertiary" />
          <span className="text-sm font-medium text-content">{channelLabel} from {brief.managerName}</span>
          <span className="text-xs text-content-tertiary">· {brief.managerRole}</span>
        </div>
        <div className="p-5">
          <p className="text-sm text-content-secondary whitespace-pre-wrap leading-relaxed">
            {brief.message}
          </p>
        </div>
        <div className="px-5 py-3 border-t border-border bg-surface-secondary flex items-center justify-between">
          <span className="text-xs text-content-tertiary">
            Deadline: <span className="font-medium text-content-secondary">{brief.deadline}</span>
          </span>
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
            Deliverable: {brief.deliverable}
          </span>
        </div>
      </div>

      {/* Start task CTA */}
      <div className="text-center">
        <Button
          size="lg"
          onClick={onStartTask}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          Start Task
        </Button>
        <p className="mt-2 text-xs text-content-tertiary">
          You'll fill in a structured template — no blank-page anxiety
        </p>
      </div>
    </motion.div>
  );
}
