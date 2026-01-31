import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ArrowRight,
  Sparkles,
  Plus,
  Lightbulb,
  ChevronDown,
  Rocket,
  Crown,
  Loader2,
  Target,
  X,
} from 'lucide-react';
import { sessionService } from '@/services/sessionService';
import { authService } from '@/services/authService';
import { Button, Card } from '@/components/common';
import { SkillTreeCanvas } from '@/components/showcase';
import { useAuthStore } from '@/stores/authStore';
import { QuotaTier } from '@/types';

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


// AI-generated combo type
interface AICombo {
  project: string;
  description: string;
  skills: string[];
  icon: string;
}

interface AISuggestedSkill {
  skill: string;
  unlocks: string[];
  icon: string;
}

// Skill Combos Panel - Pro (1/day) and Premium (unlimited)
function SkillCombosPanel({
  skills,
  plannedSkills,
  onStartLearning,
  onAddPlannedSkill,
  onRemovePlannedSkill,
  isPro,
  isPremium,
}: {
  skills: string[];
  plannedSkills: PlannedSkill[];
  onStartLearning: (skill: string) => void;
  onAddPlannedSkill: (skill: string, icon: string) => void;
  onRemovePlannedSkill: (skill: string) => void;
  isPro: boolean;
  isPremium: boolean;
}) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiCombos, setAiCombos] = useState<AICombo[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestedSkill[]>([]);
  const [hasLoadedAI, setHasLoadedAI] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number>(1);
  const [limitReached, setLimitReached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAccess = isPro || isPremium;

  // AI combo generation is user-initiated
  const generateAICombos = async () => {
    if (!hasAccess || isLoadingAI) return;

    setIsLoadingAI(true);
    setError(null);
    try {
      const result = await sessionService.getSkillCombos();
      setAiCombos(result.combos);
      setAiSuggestions(result.suggestedSkills);
      setHasLoadedAI(true);
      setRemainingToday(result.remainingToday);
      if (!isPremium && result.remainingToday <= 0) {
        setLimitReached(true);
      }
    } catch (err: any) {
      console.error('Failed to generate AI combos:', err);
      if (err?.response?.status === 403) {
        setLimitReached(true);
        setError('Daily limit reached. Upgrade to Premium for unlimited generations.');
      } else {
        setError('Failed to generate ideas. Please try again.');
      }
    } finally {
      setIsLoadingAI(false);
    }
  };

  // Check if user has a skill (fuzzy match)
  const hasSkill = (skillName: string) =>
    skills.some(s =>
      s.toLowerCase().includes(skillName.toLowerCase()) ||
      skillName.toLowerCase().includes(s.toLowerCase())
    );

  const isPlanned = (skillName: string) =>
    plannedSkills.some(s =>
      s.skill.toLowerCase() === skillName.toLowerCase()
    );

  // Filter combos
  const availableCombos = aiCombos.filter(combo =>
    combo.skills.every(s => hasSkill(s) || isPlanned(s))
  );

  const almostCombos = aiCombos.filter(combo =>
    combo.skills.some(s => hasSkill(s) || isPlanned(s)) &&
    !combo.skills.every(s => hasSkill(s) || isPlanned(s))
  ).slice(0, 3);

  const suggestedSkills = aiSuggestions.filter(s => !hasSkill(s.skill) && !isPlanned(s.skill));

  const displayedCombos = isExpanded ? availableCombos : availableCombos.slice(0, 2);

  // Free users see upgrade prompt
  if (!hasAccess) {
    return (
      <Card className="overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-100 to-amber-100 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">AI Project Ideas</h3>
          <p className="text-sm text-gray-600 mb-4">
            Get personalized project suggestions based on your skills. AI will analyze what you know and suggest exciting projects you can build.
          </p>
          <Button onClick={() => navigate('/settings?tab=billing')} className="inline-flex items-center gap-2">
            <Crown className="w-4 h-4" />
            Upgrade to Pro
          </Button>
        </div>
      </Card>
    );
  }

  const canGenerate = isPremium || (!limitReached && remainingToday > 0);

  return (
    <Card className="overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-gray-900">AI Project Ideas</h3>
            {!isPremium && hasLoadedAI && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {remainingToday > 0 ? `${remainingToday} left today` : 'Limit reached'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!hasLoadedAI ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={generateAICombos}
                disabled={isLoadingAI || skills.length === 0}
                className="text-xs"
              >
                {isLoadingAI ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    Generate Ideas
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={generateAICombos}
                disabled={isLoadingAI || !canGenerate}
                className="text-xs"
              >
                {isLoadingAI ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Regenerate
              </Button>
            )}
          </div>
        </div>
        {/* Pro user upgrade hint */}
        {!isPremium && limitReached && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">Daily limit reached</span>
            <button
              onClick={() => navigate('/settings?tab=billing')}
              className="text-purple-600 hover:text-purple-700 font-medium"
            >
              Upgrade for unlimited →
            </button>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Initial state - prompt to generate */}
        {!hasLoadedAI && !isLoadingAI && (
          <div className="text-center py-6">
            <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600 mb-1">
              Discover what you can build with your skills
            </p>
            <p className="text-xs text-gray-400">
              Click "Generate Ideas" to get AI-powered project suggestions
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoadingAI && (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Analyzing your skills...</span>
          </div>
        )}

        {/* AI Results */}
        {hasLoadedAI && !isLoadingAI && (
          <>
            {/* What you can build now */}
            {availableCombos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  You can build
                </p>
                <div className="space-y-2">
                  {displayedCombos.map((combo, i) => (
                    <motion.div
                      key={`${combo.project}-${i}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 p-2 rounded-lg bg-green-50 border border-green-100"
                    >
                      <span className="text-xl">{combo.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{combo.project}</p>
                        <p className="text-xs text-gray-500">{combo.description}</p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {combo.skills.map((s, j) => (
                          <span key={j} className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
                {availableCombos.length > 2 && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-2 text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    {isExpanded ? 'Show less' : `+${availableCombos.length - 2} more projects`}
                    <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
            )}

            {/* Almost there - one skill away */}
            {almostCombos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Learn one more to unlock
                </p>
                <div className="space-y-2">
                  {almostCombos.map((combo, i) => {
                    const missingSkill = combo.skills.find(s => !hasSkill(s) && !isPlanned(s));
                    const missingIsPlanned = combo.skills.find(s => !hasSkill(s) && isPlanned(s));
                    const displayMissing = missingSkill || missingIsPlanned;
                    const skillIsPlanned = displayMissing && isPlanned(displayMissing);
                    return (
                      <div
                        key={`${combo.project}-${i}`}
                        className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <span className="text-xl opacity-50">{combo.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700">{combo.project}</p>
                          <p className="text-xs text-gray-500">
                            Need: <span className={skillIsPlanned ? "text-blue-600 font-medium" : "text-amber-600 font-medium"}>
                              {displayMissing} {skillIsPlanned && "(planned)"}
                            </span>
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {!skillIsPlanned && displayMissing && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => onAddPlannedSkill(displayMissing, combo.icon)}
                              className="text-xs px-2 py-1"
                              title="Add to learning goals"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onStartLearning(displayMissing || '')}
                            className="text-xs px-2 py-1"
                          >
                            Start
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Suggested skills to learn */}
            {suggestedSkills.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  <Rocket className="w-3 h-3 inline mr-1" />
                  Suggested skills to learn
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {suggestedSkills.slice(0, 4).map((suggestion, i) => (
                    <div
                      key={`${suggestion.skill}-${i}`}
                      className="p-3 rounded-lg border border-dashed border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{suggestion.icon}</span>
                          <span className="text-sm font-medium text-gray-900">
                            {suggestion.skill}
                          </span>
                        </div>
                        <button
                          onClick={() => onAddPlannedSkill(suggestion.skill, suggestion.icon)}
                          className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600"
                          title="Add to learning goals"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 mb-2">
                        Unlocks: {suggestion.unlocks.slice(0, 2).join(', ')}
                      </p>
                      <button
                        onClick={() => onStartLearning(suggestion.skill)}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                      >
                        Start Learning →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {availableCombos.length === 0 && almostCombos.length === 0 && suggestedSkills.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-4">
                Learn more skills to unlock project ideas!
              </p>
            )}
          </>
        )}

        {/* Learning Goals - always visible */}
        {plannedSkills.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              <Target className="w-3 h-3 inline mr-1" />
              Your Learning Goals
            </p>
            <div className="flex flex-wrap gap-2">
              {plannedSkills.map((planned, i) => (
                <div
                  key={`planned-${i}`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 border-dashed"
                >
                  <span className="text-sm">{planned.icon}</span>
                  <span className="text-xs font-medium text-blue-700">{planned.skill}</span>
                  <button
                    onClick={() => onRemovePlannedSkill(planned.skill)}
                    className="ml-1 text-blue-400 hover:text-blue-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ShowcasePage() {
  const navigate = useNavigate();
  const { hasTierAccess } = useAuthStore();
  const isPro = hasTierAccess(QuotaTier.PRO);
  const isPremium = hasTierAccess(QuotaTier.PREMIUM);
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

  const unlockedSkills = skills
    .filter(s => s.status !== 'locked')
    .map(s => s.name);

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
            <SkillTreeCanvas skills={allSkillsForTree} onSkillClick={handleSkillClick} />
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
              Click to open | Right-click to add groups
            </p>
          </div>
        </div>

        {/* Skill Combos & Project Ideas */}
        <SkillCombosPanel
          skills={unlockedSkills}
          plannedSkills={plannedSkills}
          onStartLearning={(skill) => navigate(`/plan?skill=${encodeURIComponent(skill)}`)}
          onAddPlannedSkill={handleAddPlannedSkill}
          onRemovePlannedSkill={handleRemovePlannedSkill}
          isPro={isPro}
          isPremium={isPremium}
        />

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
