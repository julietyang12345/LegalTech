import { Flame, Trophy, GraduationCap } from 'lucide-react';
import type { Session, CurriculumDay, User } from '@/types';
import { extractConceptsFromTask1 } from '@/utils/extractConceptsFromTask1';

interface AchievementCardProps {
  session: Session;
  currentDay: CurriculumDay;
  user: User;
}

export function AchievementCard({ session, currentDay, user }: AchievementCardProps) {
  const concepts = extractConceptsFromTask1(currentDay.task1, currentDay).slice(0, 6);

  const milestoneTitle = currentDay.bossMilestone?.title
    || (currentDay.bossMilestone as any)?.microTask;

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="w-full max-w-sm mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Gradient accent bar */}
      <div className="h-2 bg-gradient-to-r from-pink-500 to-purple-500" />

      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm font-medium text-purple-600 uppercase tracking-wide">
            {currentDay.day >= session.durationDays ? 'Course Complete' : `Day ${currentDay.day} of ${session.durationDays}`}
          </p>
          <h3 className="text-lg font-bold text-gray-900 mt-1">
            {session.skillName}
          </h3>
        </div>

        {/* Concepts learned */}
        {concepts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Concepts Learned
            </p>
            <div className="flex flex-wrap gap-1.5">
              {concepts.map((concept) => (
                <span
                  key={concept}
                  className="px-2.5 py-1 text-xs font-medium bg-purple-50 text-purple-700 rounded-full"
                >
                  {concept}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Project milestone */}
        {milestoneTitle && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <Trophy className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                Project Milestone
              </p>
              <p className="text-sm text-amber-900 mt-0.5">{milestoneTitle}</p>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-center gap-4">
          {user.currentStreak > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 rounded-full">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-orange-700">
                {user.currentStreak} day streak
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-full">
            <GraduationCap className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-blue-700 capitalize">
              {session.skillLevel}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
          <span>{user.name || 'Learner'}</span>
          <span>{dateStr}</span>
        </div>
      </div>
    </div>
  );
}
