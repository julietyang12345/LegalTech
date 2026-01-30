import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DayStatus,
  type Session,
  type CreateSessionDto,
  type SessionStatus,
  type SessionMode,
  type CurriculumDay,
  type Progress,
  type SessionStep,
  type PracticeSubmitResponse,
  type DayCoreContent,
  type DayDeferredContent,
} from '@/types';
import { sessionService } from '@/services/sessionService';
import { progressService } from '@/services/progressService';

interface SessionState {
  // Current session
  activeSession: Session | null;
  sessions: Session[];
  isLoading: boolean;
  error: string | null;

  // Focus mode state
  currentDay: CurriculumDay | null;
  currentDayNumber: number | null;
  currentStep: SessionStep;
  completedSteps: SessionStep[];
  stepStartTime: Date | null;
  sessionProgress: Progress[];

  // Two-phase curriculum state
  isDayLoading: boolean;
  dayLoadingNumber: number | null;

  // Split loading state (core + deferred)
  isCoreLoaded: boolean;
  isDeferredLoading: boolean;
  isDeferredLoaded: boolean;
  deferredContent: DayDeferredContent | null;

  // Regeneration state (for showing full loading screen during regenerate)
  isRegenerating: boolean;

  // Day content variant tracking (for quality-based caching and rate limiting)
  currentDayVariantId: string | null;
  regenCount: number;
  regenLimit: number;

  // Task/Quiz progress state (persists during session)
  taskProgress: Record<string, {
    answers: Record<string, number | null>;
    currentIndex: number;
    showResults: boolean;
  }>;

  // Actions
  createSession: (dto: CreateSessionDto) => Promise<Session>;
  fetchSessions: () => Promise<void>;
  fetchActiveSession: () => Promise<void>;
  setActiveSession: (session: Session | null) => void;
  updateSession: (id: string, updates: { status?: SessionStatus; mode?: SessionMode; currentDay?: number; improvementAreas?: string[] }) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // Focus mode actions
  startDay: (dayNumber: number) => void;
  setCurrentStep: (step: SessionStep) => void;
  completeStep: (step: SessionStep) => void;
  resetSteps: () => void;

  // Two-phase curriculum actions
  submitPracticeProject: (dayNumber: number, answer: string, confidence?: number) => Promise<PracticeSubmitResponse>;
  getDayStatus: (dayNumber: number) => DayStatus;
  canStartDay: (dayNumber: number) => boolean;

  // Split loading actions (core + deferred)
  loadDayCoreContent: (dayNumber: number, forceRegenerate?: boolean) => Promise<DayCoreContent>;
  // loadDayCoreContentStream: (dayNumber: number, forceRegenerate?: boolean) => Promise<DayCoreContent>; // SSE disabled
  loadDayDeferredContent: (dayNumber: number) => Promise<DayDeferredContent>;
  // loadDayDeferredContentStream: (dayNumber: number) => Promise<DayDeferredContent>; // SSE disabled
  loadDayContentSplit: (dayNumber: number) => Promise<CurriculumDay>;
  getDeferredContent: () => DayDeferredContent | null;
  resetSplitLoadingState: () => void;
  regenerateDayContent: (dayNumber: number) => Promise<void>;

  // Streaming state (SSE disabled)
  // streamingCards: any[];
  // isStreaming: boolean;
  // streamCleanup: (() => void) | null;
  // isDeferredStreaming: boolean;
  // deferredStreamCleanup: (() => void) | null;

  // Alternative task format actions
  getAlternativeTaskFormat: (dayNumber: number, format: 'code' | 'quiz' | 'fillBlank') => Promise<any>;
  alternativeTaskLoading: boolean;
  alternativeTaskCache: Record<string, any>; // key: "day-format", value: task

  // Task progress actions (stepKey differentiates between quiz, conceptCheck, etc.)
  saveTaskProgress: (dayNumber: number, stepKey: string, progress: { answers: Record<string, number | null>; currentIndex: number; showResults: boolean }) => void;
  getTaskProgress: (dayNumber: number, stepKey: string) => { answers: Record<string, number | null>; currentIndex: number; showResults: boolean } | null;
  clearTaskProgress: (dayNumber: number, stepKey: string) => void;
  hasStepEngagement: (dayNumber: number, stepKey: string) => boolean;

  // Progress actions
  fetchProgress: (sessionId: string) => Promise<void>;
  updateTaskProgress: (taskId: string, updates: { completed?: boolean; confidenceScore?: number; timeSpentMinutes?: number }) => Promise<void>;

  // Helpers
  getCurrentDayData: () => CurriculumDay | null;
  getStepProgress: () => { current: number; total: number };
  clearError: () => void;
}

// Step order for session flow
const STEP_ORDER: SessionStep[] = [
  'prePrompt',
  'video',
  'foundationCards',
  'task1',
  'bossMilestone',
  'reflection',
];

// Helper to get step order
const getStepOrder = (): SessionStep[] => STEP_ORDER;

// Helper to update day statuses in curriculum days array
const updateDayStatuses = (
  days: CurriculumDay[],
  updates: Array<{ dayNumber: number; status: DayStatus }>
): CurriculumDay[] => {
  return days.map((d) => {
    const update = updates.find((u) => u.dayNumber === d.day);
    return update ? { ...d, status: update.status } : d;
  });
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
  activeSession: null,
  sessions: [],
  isLoading: false,
  error: null,

  currentDay: null,
  currentDayNumber: null as number | null,
  currentStep: 'prePrompt',
  completedSteps: [],
  stepStartTime: null,
  sessionProgress: [],

  // Two-phase curriculum state
  isDayLoading: false,
  dayLoadingNumber: null,

  // Split loading state (core + deferred)
  isCoreLoaded: false,
  isDeferredLoading: false,
  isDeferredLoaded: false,
  deferredContent: null,

  // Regeneration state
  isRegenerating: false,

  // Streaming state (SSE disabled)
  // streamingCards: [] as any[],
  // isStreaming: false,
  // streamCleanup: null as (() => void) | null,
  // isDeferredStreaming: false,
  // deferredStreamCleanup: null as (() => void) | null,

  // Day content variant tracking
  currentDayVariantId: null as string | null,
  regenCount: 0,
  regenLimit: 3, // Default, updated from API response

  // Task progress state
  taskProgress: {},

  // Alternative task format state
  alternativeTaskLoading: false,
  alternativeTaskCache: {},

  createSession: async (dto: CreateSessionDto) => {
    // SSE disabled - no stream cleanup needed
    // const { streamCleanup, deferredStreamCleanup } = get();
    // if (streamCleanup) streamCleanup();
    // if (deferredStreamCleanup) deferredStreamCleanup();

    set({ isLoading: true, error: null });
    try {
      const response = await sessionService.create(dto);
      // Reset ALL day-related state when creating a new session
      set((state) => ({
        activeSession: response.session,
        sessions: [response.session, ...state.sessions],
        isLoading: false,
        // Reset day state for fresh start
        currentDay: null,
        currentDayNumber: null,
        currentStep: 'prePrompt' as const,
        completedSteps: [],
        stepStartTime: null,
        sessionProgress: [],
        // Reset loading state
        isDayLoading: false,
        dayLoadingNumber: null,
        isCoreLoaded: false,
        isDeferredLoading: false,
        isDeferredLoaded: false,
        deferredContent: null,
        isRegenerating: false,
        // Streaming state disabled (SSE)
        // streamingCards: [],
        // isStreaming: false,
        // streamCleanup: null,
        // isDeferredStreaming: false,
        // deferredStreamCleanup: null,
        // Reset variant tracking
        currentDayVariantId: null,
        regenCount: 0,
        // Reset task progress for new session
        taskProgress: {},
        alternativeTaskLoading: false,
        alternativeTaskCache: {},
      }));
      return response.session;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to create session',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const response = await sessionService.getAll();
      set({ sessions: response.sessions, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to fetch sessions',
        isLoading: false,
      });
    }
  },

  fetchActiveSession: async () => {
    set({ isLoading: true });
    try {
      const response = await sessionService.getActive();
      set({ activeSession: response.session, isLoading: false });
    } catch (error: any) {
      console.error('[fetchActiveSession] Error:', error);
      set({
        error: error.response?.data?.message || 'Failed to fetch active session',
        isLoading: false,
      });
    }
  },

  setActiveSession: (session) => {
    set({ activeSession: session });
    if (session) {
      const currentDayData = session.curriculum.days.find(d => d.day === session.currentDay);
      set({ currentDay: currentDayData || null });
    }
  },

  updateSession: async (id, updates) => {
    set({ isLoading: true });
    try {
      const response = await sessionService.update(id, updates);
      set((state) => ({
        activeSession: state.activeSession?.id === id ? response.session : state.activeSession,
        sessions: state.sessions.map(s => s.id === id ? response.session : s),
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to update session',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteSession: async (id) => {
    set({ isLoading: true });
    try {
      await sessionService.delete(id);
      set((state) => ({
        activeSession: state.activeSession?.id === id ? null : state.activeSession,
        sessions: state.sessions.filter(s => s.id !== id),
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to delete session',
        isLoading: false,
      });
      throw error;
    }
  },

  // Focus mode actions
  startDay: (dayNumber) => {
    const { activeSession, currentDayNumber, completedSteps, currentStep } = get();
    if (!activeSession) return;

    const dayData = activeSession.curriculum.days.find(d => d.day === dayNumber);

    // Merge saved day content into top level for refresh
    // Backend saves to: coreContent (video, foundationCards) + deferredContent (task1, reflection, intensivePractice)
    // Frontend expects flat structure: day.video, day.foundationCards, day.task1, etc.
    if (!dayData) {
      set({ currentDay: null, currentStep: 'prePrompt', completedSteps: [], stepStartTime: new Date() });
      return;
    }

    // Merge coreContent and deferredContent first
    const mergedDay: CurriculumDay = {
      ...dayData,
      ...(dayData.coreContent as object),
      ...(dayData.deferredContent as object),
    };

    // Use bossMilestone from coreContent (AI-generated) or dayData, with fallback
    if (!mergedDay.bossMilestone) {
      const bossProject = activeSession.curriculum.bossProjects?.find(
        bp => bp.combinesDays?.includes(dayNumber)
      );
      if (bossProject) {
        const dayIndex = bossProject.combinesDays?.indexOf(dayNumber) ?? 0;
        const totalDays = bossProject.combinesDays?.length ?? 1;
        mergedDay.bossMilestone = {
          day: dayNumber,
          title: `Day ${dayIndex + 1} Contribution`,
          description: bossProject.free?.projectDescription || bossProject.description || bossProject.title,
          microTask: `Day ${dayIndex + 1} of ${totalDays}: ${bossProject.title}`,
          dayContribution: `Building towards ${bossProject.title}`,
          conceptConnection: `This builds your ${bossProject.title} project`,
          estimatedMinutes: 15,
          starterCode: bossProject.files?.starter || '// Start your project code here\n\n',
          validationType: 'run',
        };
      }
    }

    // Preserve step progress if resuming the same day (e.g., page refresh)
    const isResumingSameDay = currentDayNumber === dayNumber;

    set({
      currentDay: mergedDay,
      currentDayNumber: dayNumber,
      currentStep: isResumingSameDay ? currentStep : 'prePrompt',
      completedSteps: isResumingSameDay ? completedSteps : [],
      stepStartTime: new Date(),
    });
  },

  setCurrentStep: (step) => {
    set({
      currentStep: step,
      stepStartTime: new Date(),
    });
  },

  completeStep: (step) => {
    const { completedSteps, currentDay } = get();

    const stepOrder = getStepOrder();
    const currentIndex = stepOrder.indexOf(step);

    // Find next step (skip steps that don't apply)
    let nextStep = stepOrder[currentIndex + 1];

    // Skip foundationCards if not present (check both regular and language-specific cards)
    if (nextStep === 'foundationCards') {
      const hasCards = (currentDay?.foundationCards && currentDay.foundationCards.length > 0) ||
                       (currentDay?.languageFoundationCards && currentDay.languageFoundationCards.length > 0);
      if (!hasCards) {
        nextStep = stepOrder[currentIndex + 2];
      }
    }

    // Skip bossMilestone if not present (check both bossMilestone and hasBossProject)
    if (nextStep === 'bossMilestone' && !currentDay?.bossMilestone && !currentDay?.hasBossProject) {
      nextStep = stepOrder[currentIndex + 2];
    }

    // Add to completed steps if not already there
    const newCompletedSteps = completedSteps.includes(step)
      ? completedSteps
      : [...completedSteps, step];

    set({
      completedSteps: newCompletedSteps,
      currentStep: nextStep || 'reflection',
      stepStartTime: new Date(),
    });
  },

  resetSteps: () => {
    set({
      currentStep: 'prePrompt',
      completedSteps: [],
      stepStartTime: null,
    });
  },

  // Progress actions
  fetchProgress: async (sessionId) => {
    try {
      const response = await progressService.getBySession(sessionId);
      set({ sessionProgress: response.progress });
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
  },

  updateTaskProgress: async (taskId, updates) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const response = await progressService.updateTask(activeSession.id, taskId, updates);
      set((state) => {
        const existingIndex = state.sessionProgress.findIndex(p => p.taskId === taskId);
        if (existingIndex >= 0) {
          const newProgress = [...state.sessionProgress];
          newProgress[existingIndex] = response.progress;
          return { sessionProgress: newProgress };
        }
        return { sessionProgress: [...state.sessionProgress, response.progress] };
      });
    } catch (error) {
      console.error('Failed to update progress:', error);
      throw error;
    }
  },

  // ═══════════════════════════════════════════════════
  // SPLIT LOADING ACTIONS (Core + Deferred)
  // ═══════════════════════════════════════════════════

  loadDayCoreContent: async (dayNumber: number, forceRegenerate?: boolean) => {
    const { activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    set({
      isDayLoading: true,
      dayLoadingNumber: dayNumber,
      isCoreLoaded: false,
      isDeferredLoaded: false,
      deferredContent: null,
      error: null,
    });

    try {
      const response = await sessionService.startDayCore(activeSession.id, dayNumber, forceRegenerate);
      const coreContent = response.coreContent;
      const bossProject = response.bossProject;
      const variantId = response.variantId;
      const regenCount = response.regenCount ?? 0;
      const regenLimit = response.regenLimit ?? 3;

      // Update the curriculum day with core content and boss project if available
      set((state) => {
        if (!state.activeSession) return state;

        const updatedDays = state.activeSession.curriculum.days.map((d) => {
          if (d.day !== dayNumber) return d;
          // Preserve COMPLETED/SKIPPED status when revisiting - only set IN_PROGRESS if UNLOCKABLE
          const newStatus = (d.status === DayStatus.COMPLETED || d.status === DayStatus.SKIPPED)
            ? d.status
            : DayStatus.IN_PROGRESS;
          return {
            ...d,
            ...coreContent,
            detailsLoaded: false, // Not fully loaded yet
            status: newStatus,
          };
        });

        // Update boss projects if we received updated boss project data
        let updatedBossProjects = state.activeSession.curriculum.bossProjects;
        if (bossProject) {
          updatedBossProjects = state.activeSession.curriculum.bossProjects.map((bp) =>
            bp.day === bossProject.day ? bossProject : bp
          );
        }

        // Update activeSession.currentDay if loading a new day (sync with backend)
        const newCurrentDay = dayNumber > state.activeSession.currentDay
          ? dayNumber
          : state.activeSession.currentDay;

        // Check if this is fresh content for a new day (not a refresh of already-loaded day)
        const existingDay = state.activeSession.curriculum.days.find((d) => d.day === dayNumber);
        const isNewDayContent = !existingDay?.detailsLoaded && !existingDay?.coreContent;

        return {
          activeSession: {
            ...state.activeSession,
            currentDay: newCurrentDay,
            curriculum: {
              ...state.activeSession.curriculum,
              days: updatedDays,
              bossProjects: updatedBossProjects,
            },
          },
          currentDay: { ...updatedDays.find((d) => d.day === dayNumber)! },
          currentDayNumber: dayNumber,
          isDayLoading: false,
          dayLoadingNumber: null,
          isCoreLoaded: true,
          // Reset step state when loading fresh content (not resuming)
          ...(isNewDayContent ? {
            currentStep: 'prePrompt' as const,
            completedSteps: [],
            stepStartTime: new Date(),
          } : {}),
          // Variant tracking for quality-based caching
          currentDayVariantId: variantId || null,
          regenCount,
          regenLimit,
        };
      });

      return coreContent;
    } catch (error: any) {
      // Check for rate limit error (429)
      const isRateLimitError = error.response?.status === 429;
      set({
        error: isRateLimitError
          ? error.response?.data?.message || 'Regeneration limit reached. Try again later.'
          : error.response?.data?.message || 'Failed to load core content',
        isDayLoading: false,
        dayLoadingNumber: null,
        isCoreLoaded: false,
      });
      throw error;
    }
  },

  // SSE STREAMING DISABLED - using regular loading instead
  // loadDayCoreContentStream: async (dayNumber: number, forceRegenerate?: boolean) => { ... },

  loadDayDeferredContent: async (dayNumber: number) => {
    const { activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    set({ isDeferredLoading: true });

    try {
      const response = await sessionService.loadDayDeferred(activeSession.id, dayNumber);
      const deferredContent = response.deferredContent;

      // Update the curriculum day with deferred content
      set((state) => {
        if (!state.activeSession) return state;

        const updatedDays = state.activeSession.curriculum.days.map((d) =>
          d.day === dayNumber
            ? {
                ...d,
                ...deferredContent,
                detailsLoaded: true, // Now fully loaded
              }
            : d
        );

        return {
          activeSession: {
            ...state.activeSession,
            curriculum: {
              ...state.activeSession.curriculum,
              days: updatedDays,
            },
          },
          currentDay: state.currentDay?.day === dayNumber
            ? { ...state.currentDay, ...deferredContent, detailsLoaded: true }
            : state.currentDay,
          deferredContent,
          isDeferredLoading: false,
          isDeferredLoaded: true,
        };
      });

      return deferredContent;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to load deferred content',
        isDeferredLoading: false,
      });
      throw error;
    }
  },

  // SSE STREAMING DISABLED - using regular loading instead
  // loadDayDeferredContentStream: async (dayNumber: number) => { ... },

  loadDayContentSplit: async (dayNumber: number) => {
    const { loadDayCoreContent, loadDayDeferredContent, activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    // Load core content (non-streaming - simpler and more reliable)
    await loadDayCoreContent(dayNumber);

    // Start deferred loading in background (don't await - let it run)
    loadDayDeferredContent(dayNumber).catch((err) => {
      console.error('Deferred content loading failed:', err);
    });

    // Return the day with core content loaded
    const { currentDay } = get();
    return currentDay as CurriculumDay;
  },

  getDeferredContent: () => {
    return get().deferredContent;
  },

  resetSplitLoadingState: () => {
    set({
      isCoreLoaded: false,
      isDeferredLoading: false,
      isDeferredLoaded: false,
      deferredContent: null,
    });
  },

  regenerateDayContent: async (dayNumber: number) => {
    const { activeSession, loadDayCoreContent, loadDayDeferredContent, regenCount, regenLimit } = get();
    if (!activeSession) throw new Error('No active session');

    // Check if rate limit already reached (client-side check)
    if (regenCount >= regenLimit) {
      set({
        error: `Regeneration limit reached (${regenLimit} per day). Continue with current content or try again later.`,
      });
      throw new Error('Rate limit reached');
    }

    // Set regenerating state to show full loading screen
    set({ isRegenerating: true, error: null });

    try {
      // Force regenerate core content (bypasses all caches)
      // Uses non-streaming POST endpoint for forceRegenerate
      await loadDayCoreContent(dayNumber, true);

      // Start deferred loading in background
      loadDayDeferredContent(dayNumber).catch((err) => {
        console.error('Deferred content loading failed:', err);
      });

      // Clear all local progress for this day
      const sessionId = activeSession.id;
      set((state) => {
        // Remove all taskProgress entries for this day
        const newTaskProgress = { ...state.taskProgress };
        Object.keys(newTaskProgress).forEach((key) => {
          if (key.startsWith(`${sessionId}-day${dayNumber}-`)) {
            delete newTaskProgress[key];
          }
        });

        // Remove all alternativeTaskCache entries for this day
        const newAlternativeTaskCache = { ...state.alternativeTaskCache };
        Object.keys(newAlternativeTaskCache).forEach((key) => {
          if (key.startsWith(`${dayNumber}-`)) {
            delete newAlternativeTaskCache[key];
          }
        });

        return {
          taskProgress: newTaskProgress,
          alternativeTaskCache: newAlternativeTaskCache,
          // Reset step progress
          currentStep: 'prePrompt',
          completedSteps: [],
          stepStartTime: new Date(),
        };
      });
    } finally {
      set({ isRegenerating: false });
    }
  },

  // ═══════════════════════════════════════════════════
  // ALTERNATIVE TASK FORMAT ACTIONS
  // ═══════════════════════════════════════════════════

  getAlternativeTaskFormat: async (dayNumber: number, format: 'code' | 'quiz' | 'fillBlank') => {
    const { activeSession, alternativeTaskCache, currentDay } = get();
    if (!activeSession) throw new Error('No active session');

    // Check local cache first
    const cacheKey = `${dayNumber}-${format}`;
    if (alternativeTaskCache[cacheKey]) {
      return alternativeTaskCache[cacheKey];
    }

    // Check if original task is already in this format
    const originalTask = currentDay?.task1;
    const originalFormat = (originalTask as any)?.format || 'code';
    if (originalFormat === format && originalTask) {
      return originalTask;
    }

    set({ alternativeTaskLoading: true });

    try {
      const response = await sessionService.getAlternativeTaskFormat(
        activeSession.id,
        dayNumber,
        format,
      );

      // Cache the result locally
      set((state) => ({
        alternativeTaskLoading: false,
        alternativeTaskCache: {
          ...state.alternativeTaskCache,
          [cacheKey]: response.task,
        },
      }));

      return response.task;
    } catch (error: any) {
      set({
        alternativeTaskLoading: false,
        error: error.response?.data?.message || 'Failed to load alternative format',
      });
      throw error;
    }
  },

  // ═══════════════════════════════════════════════════
  // TASK PROGRESS ACTIONS
  // ═══════════════════════════════════════════════════

  saveTaskProgress: (dayNumber: number, stepKey: string, progress) => {
    const { activeSession } = get();
    if (!activeSession) return;

    const key = `${activeSession.id}-day${dayNumber}-${stepKey}`;
    set((state) => ({
      taskProgress: {
        ...state.taskProgress,
        [key]: progress,
      },
    }));
  },

  getTaskProgress: (dayNumber: number, stepKey: string) => {
    const { activeSession, taskProgress } = get();
    if (!activeSession) return null;

    const key = `${activeSession.id}-day${dayNumber}-${stepKey}`;
    return taskProgress[key] || null;
  },

  clearTaskProgress: (dayNumber: number, stepKey: string) => {
    const { activeSession } = get();
    if (!activeSession) return;

    const key = `${activeSession.id}-day${dayNumber}-${stepKey}`;
    set((state) => {
      const { [key]: _, ...rest } = state.taskProgress;
      return { taskProgress: rest };
    });
  },

  // Check if user has engaged with a step (answered at least one question, typed code, etc.)
  hasStepEngagement: (dayNumber: number, stepKey: string) => {
    const { activeSession, taskProgress } = get();
    if (!activeSession) return false;

    const key = `${activeSession.id}-day${dayNumber}-${stepKey}`;
    const progress = taskProgress[key];
    if (!progress) return false;

    // Has engagement if any answers exist
    return Object.keys(progress.answers).length > 0;
  },

  submitPracticeProject: async (dayNumber: number, answer: string, confidence?: number) => {
    const { activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    try {
      const result = await sessionService.submitPracticeProject(
        activeSession.id,
        dayNumber,
        answer,
        confidence
      );

      // Always update day status to completed and advance currentDay
      // (matches backend behavior which always advances currentDay on success)
      set((state) => {
        if (!state.activeSession) return state;

        const statusUpdates: Array<{ dayNumber: number; status: DayStatus }> = [
          { dayNumber, status: DayStatus.COMPLETED },
        ];

        // Also unlock next day if applicable
        if (result.nextDayUnlocked) {
          statusUpdates.push({ dayNumber: dayNumber + 1, status: DayStatus.UNLOCKABLE });
        }

        const updatedDays = updateDayStatuses(state.activeSession.curriculum.days, statusUpdates);

        // Always advance currentDay to match backend behavior
        const newCurrentDay = dayNumber >= state.activeSession.currentDay
          ? dayNumber + 1
          : state.activeSession.currentDay;

        return {
          activeSession: {
            ...state.activeSession,
            currentDay: newCurrentDay,
            curriculum: {
              ...state.activeSession.curriculum,
              days: updatedDays,
            },
          },
        };
      });

      return result;
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to submit practice project' });
      throw error;
    }
  },

  getDayStatus: (dayNumber: number) => {
    const { activeSession } = get();
    if (!activeSession) return DayStatus.LOCKED;

    const day = activeSession.curriculum.days.find((d) => d.day === dayNumber);
    return day?.status || DayStatus.LOCKED;
  },

  canStartDay: (dayNumber: number) => {
    const { activeSession } = get();
    if (!activeSession) return false;

    const day = activeSession.curriculum.days.find((d) => d.day === dayNumber);
    if (!day) return false;

    // Can start if status is 'unlockable', 'in_progress', 'completed', or 'skipped'
    // This allows navigating back to previously completed days
    return (
      day.status === DayStatus.UNLOCKABLE ||
      day.status === DayStatus.IN_PROGRESS ||
      day.status === DayStatus.COMPLETED ||
      day.status === DayStatus.SKIPPED
    );
  },

  // Helpers
  getCurrentDayData: () => {
    const { activeSession } = get();
    if (!activeSession) return null;
    return activeSession.curriculum.days.find(d => d.day === activeSession.currentDay) || null;
  },

  getStepProgress: () => {
    const { completedSteps, currentDay } = get();
    const stepOrder = getStepOrder();
    let total = stepOrder.length;

    // Adjust total based on what's available (check both regular and language-specific cards)
    const hasCards = (currentDay?.foundationCards && currentDay.foundationCards.length > 0) ||
                     (currentDay?.languageFoundationCards && currentDay.languageFoundationCards.length > 0);
    if (!hasCards) total -= 1;
    if (!currentDay?.bossMilestone && !currentDay?.hasBossProject) total -= 1;

    return {
      current: completedSteps.length,
      total,
    };
  },

  clearError: () => set({ error: null }),
    }),
    {
      name: 'flexforge-task-progress',
      // Persist taskProgress and step completion state to localStorage
      partialize: (state) => ({
        taskProgress: state.taskProgress,
        currentDayNumber: state.currentDayNumber,
        completedSteps: state.completedSteps,
        currentStep: state.currentStep,
      }),
    }
  )
);
