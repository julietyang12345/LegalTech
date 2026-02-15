import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DayStatus,
  GoalType,
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
import { getStepFlow } from '@/config/training-configs';

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

  // Streaming state (SSE progressive loading)
  isStreamingComplete: boolean;
  streamAbortController: AbortController | null;

  // Regeneration state (for showing full loading screen during regenerate)
  isRegenerating: boolean;
  showRegenLimitModal: boolean; // Show upgrade modal when regen limit reached

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

  // Split loading actions (core + deferred, core uses SSE streaming)
  loadDayCoreContent: (dayNumber: number, forceRegenerate?: boolean) => Promise<DayCoreContent>;
  loadDayDeferredContent: (dayNumber: number, forceRegenerate?: boolean, retryCount?: number) => Promise<DayDeferredContent>;
  loadDayContentSplit: (dayNumber: number) => Promise<CurriculumDay>;
  getDeferredContent: () => DayDeferredContent | null;
  resetSplitLoadingState: () => void;
  regenerateDayContent: (dayNumber: number) => Promise<void>;
  dismissRegenLimitModal: () => void;

  // Streaming cleanup
  cleanupStream: () => void;

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

// Helper to get step order based on goalType (source of truth: training-configs.ts)
const getStepOrder = (goalType?: GoalType): SessionStep[] => {
  return getStepFlow(goalType);
};

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
  showRegenLimitModal: false,

  // Streaming state
  isStreamingComplete: true,
  streamAbortController: null as AbortController | null,

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
    // Cleanup any active stream before creating new session
    const { streamAbortController } = get();
    if (streamAbortController) streamAbortController.abort();

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
        // Streaming state
        isStreamingComplete: true,
        streamAbortController: null,
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
      const session = response.session;

      // Check if current day's content is already cached in the session
      // Same logic as setActiveSession to preserve cache state
      const currentDayData = session?.curriculum?.days?.find((d: any) => d.day === session?.currentDay);
      const isContentCached = currentDayData?.coreLoaded || currentDayData?.coreContent;
      const isDeferredCached = currentDayData?.detailsLoaded || currentDayData?.deferredContent;

      // Merge coreContent and deferredContent into currentDay (same as startDay does)
      // Backend saves nested: coreContent.video, coreContent.foundationCards
      // Frontend expects flat: currentDay.video, currentDay.foundationCards
      let mergedDay = currentDayData || null;
      if (currentDayData) {
        mergedDay = {
          ...currentDayData,
          ...(currentDayData.coreContent as object),
          ...(currentDayData.deferredContent as object),
        };
      }

      set({
        activeSession: session,
        currentDay: mergedDay,
        isCoreLoaded: !!isContentCached,
        isDeferredLoaded: !!isDeferredCached,
        isLoading: false,
      });
    } catch (error: any) {
      console.error('[fetchActiveSession] Error:', error);
      set({
        error: error.response?.data?.message || 'Failed to fetch active session',
        isLoading: false,
      });
    }
  },

  setActiveSession: (session) => {
    // Check if current day's content is already cached in the session
    const currentDayData = session?.curriculum?.days?.find(d => d.day === session.currentDay);
    const isContentCached = currentDayData?.coreLoaded || currentDayData?.coreContent;
    const isDeferredCached = currentDayData?.detailsLoaded || currentDayData?.deferredContent;

    // Merge coreContent and deferredContent into currentDay (same as startDay does)
    // Backend saves nested: coreContent.video, coreContent.task1
    // Frontend expects flat: currentDay.video, currentDay.task1
    let mergedDay = currentDayData || null;
    if (currentDayData) {
      mergedDay = {
        ...currentDayData,
        ...(currentDayData.coreContent as object),
        ...(currentDayData.deferredContent as object),
      };
    }

    set({
      activeSession: session,
      currentDay: mergedDay,
      // Only set isCoreLoaded if content is already cached
      isCoreLoaded: !!isContentCached,
      isDeferredLoading: false,
      isDeferredLoaded: !!isDeferredCached,
      deferredContent: isDeferredCached ? (currentDayData?.deferredContent as any) : null,
      isDayLoading: false,
      dayLoadingNumber: null,
    });
  },

  updateSession: async (id, updates) => {
    set({ isLoading: true });
    try {
      const response = await sessionService.update(id, updates);
      set((state) => {
        // If we're setting a session to ACTIVE, it becomes the new activeSession
        // If we're pausing/completing/abandoning the current active session, clear activeSession
        let newActiveSession = state.activeSession;

        if (updates.status === 'ACTIVE') {
          // This session is becoming active
          newActiveSession = response.session;
        } else if (state.activeSession?.id === id) {
          // We're updating the current active session (e.g., pausing it)
          if (updates.status === 'PAUSED' || updates.status === 'COMPLETED' || updates.status === 'ABANDONED') {
            newActiveSession = null;
          } else {
            newActiveSession = response.session;
          }
        }

        return {
          activeSession: newActiveSession,
          sessions: state.sessions.map(s => s.id === id ? response.session : s),
          isLoading: false,
        };
      });
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
    if (!activeSession?.curriculum?.days) return;

    const dayData = activeSession.curriculum.days.find(d => d.day === dayNumber);

    // Merge saved day content into top level for refresh
    // Backend saves to: coreContent (video, task1, prePrompt) + deferredContent (reflection, intensivePractice)
    // Frontend expects flat structure: day.video, day.task1, etc.
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
    const { completedSteps, currentDay, activeSession } = get();

    const stepOrder = getStepOrder(activeSession?.goalType as GoalType | undefined);
    const currentIndex = stepOrder.indexOf(step);

    // Find next step (skip steps that don't apply)
    let nextStep = stepOrder[currentIndex + 1];

    // Skip bossMilestone only if explicitly not present (deferred content loaded but no milestone)
    // Don't skip if undefined - content might still be loading
    if (nextStep === 'bossMilestone') {
      // bossMilestone content is always present now (either boss project or intensive practice)
      // The component handles both cases, so we shouldn't skip it
    }

    // Skip openTask only if explicitly not present (deferred content loaded but no openTask)
    // openTask comes from DEFERRED content (Haiku)
    // Don't skip if undefined - content might still be loading
    if (nextStep === 'openTask') {
      const openTask = currentDay?.openTask;
      // Only skip if explicitly set to null/empty, not if undefined
      if (openTask === null || (typeof openTask === 'object' && Object.keys(openTask).length === 0)) {
        nextStep = stepOrder[currentIndex + 2];
      }
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
    const { activeSession, streamAbortController: prevController } = get();
    if (!activeSession) throw new Error('No active session');

    // Abort any previous stream
    if (prevController) prevController.abort();

    // Check if core content is already cached in session data (skip API call)
    // This works even if zustand state (isCoreLoaded) wasn't properly set
    if (!forceRegenerate) {
      const existingDay = activeSession.curriculum.days.find((d) => d.day === dayNumber);
      if (existingDay?.coreLoaded && existingDay?.coreContent) {
        // Reset steps if switching to a different day (prevents stale step from previous day)
        const isDifferentDay = get().currentDayNumber !== dayNumber;
        // Update zustand state to reflect cached content
        set({
          isCoreLoaded: true,
          isStreamingComplete: true,
          currentDayNumber: dayNumber,
          currentDay: { ...existingDay },
          ...(isDifferentDay ? {
            currentStep: 'prePrompt' as const,
            completedSteps: [],
            stepStartTime: new Date(),
          } : {}),
        });
        return existingDay.coreContent as unknown as DayCoreContent;
      }
    }

    // Build prePrompt instantly from skeleton data (no network needed)
    const skeletonDay = activeSession.curriculum.days.find((d) => d.day === dayNumber);
    const skeletonSkills: string[] = (skeletonDay as any)?.skills || skeletonDay?.objectives || [];
    const skeletonPrePrompt = {
      text: `Today you'll learn about ${skeletonDay?.title || 'something new'}`,
      skills: skeletonSkills,
    };

    // Determine if steps should reset — always reset when switching to a different day
    const isDifferentDay = get().currentDayNumber !== dayNumber;
    const isNewDayContent = !skeletonDay?.detailsLoaded && !skeletonDay?.coreContent;
    const shouldResetSteps = isDifferentDay || isNewDayContent || forceRegenerate;

    set((state) => {
      if (!state.activeSession) return state;

      // Set prePrompt on the day immediately from skeleton
      const updatedDays = state.activeSession.curriculum.days.map((d) => {
        if (d.day !== dayNumber) return d;
        return { ...d, prePrompt: skeletonPrePrompt as any };
      });
      const newCurrentDayObj = updatedDays.find((d) => d.day === dayNumber)!;

      return {
        isDayLoading: true,
        dayLoadingNumber: dayNumber,
        isCoreLoaded: false,
        isStreamingComplete: false,
        isDeferredLoaded: false,
        deferredContent: null,
        error: null,
        currentDayNumber: dayNumber,
        currentDay: { ...newCurrentDayObj },
        activeSession: {
          ...state.activeSession,
          curriculum: { ...state.activeSession.curriculum, days: updatedDays },
        },
        ...(shouldResetSteps ? {
          currentStep: 'prePrompt' as const,
          completedSteps: [],
          stepStartTime: new Date(),
        } : {}),
      };
    });

    // Track whether the stream delivered content (for fallback logic)
    let streamDelivered = false;
    let coreContentResult: DayCoreContent | null = null;

    try {
      // Try SSE streaming first for progressive loading
      coreContentResult = await new Promise<DayCoreContent>((resolve, reject) => {
        let receivedSections: any[] = [];
        let hasError = false;

        const controller = sessionService.startDayCoreStream(
          activeSession.id,
          dayNumber,
          (event, data) => {
            if (hasError) return;

            switch (event) {
              case 'task1SectionStart': {
                // Section shell — create empty section, set isCoreLoaded on first
                const { index, type, title, containerKey: key } = data;
                const emptySection: any = { type, title, questions: [] };
                if (key && key !== 'questions') {
                  delete emptySection.questions;
                  emptySection[key] = [];
                }
                receivedSections[index] = emptySection;
                streamDelivered = true;

                if (index === 0) {
                  // First section start → show UI immediately
                  set((state) => {
                    if (!state.activeSession) return state;
                    const partialTask1 = {
                      id: `day${dayNumber}-task1`,
                      format: 'sections' as const,
                      title: 'Practice',
                      description: '',
                      estimatedMinutes: 10,
                      passingScore: 0.7,
                      sections: [emptySection],
                    };
                    const updatedDays = state.activeSession.curriculum.days.map((d) => {
                      if (d.day !== dayNumber) return d;
                      const newStatus = (d.status === DayStatus.COMPLETED || d.status === DayStatus.SKIPPED)
                        ? d.status : DayStatus.IN_PROGRESS;
                      return { ...d, task1: partialTask1, detailsLoaded: false, status: newStatus };
                    });
                    const newCurrentDay = dayNumber > state.activeSession.currentDay
                      ? dayNumber : state.activeSession.currentDay;
                    const newCurrentDayObj = updatedDays.find((d) => d.day === dayNumber)!;
                    return {
                      activeSession: {
                        ...state.activeSession,
                        currentDay: newCurrentDay,
                        curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                      },
                      currentDay: { ...newCurrentDayObj },
                      isDayLoading: false,
                      dayLoadingNumber: null,
                      isCoreLoaded: true,
                    };
                  });
                } else {
                  // Subsequent section start — append empty section shell
                  set((state) => {
                    if (!state.activeSession || !state.currentDay) return state;
                    const currentTask1 = (state.currentDay as any).task1;
                    if (!currentTask1?.sections) return state;
                    const updatedSections = [...currentTask1.sections];
                    updatedSections[index] = emptySection;
                    const updatedTask1 = { ...currentTask1, sections: updatedSections };
                    const updatedDays = state.activeSession.curriculum.days.map((d) =>
                      d.day === dayNumber ? { ...d, task1: updatedTask1 } : d
                    );
                    return {
                      activeSession: {
                        ...state.activeSession,
                        curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                      },
                      currentDay: { ...state.currentDay, task1: updatedTask1 },
                    };
                  });
                }
                break;
              }
              case 'task1Question': {
                // Individual question — idempotent insert by questionIndex
                const { sectionIndex, questionIndex, question } = data;
                // Update local tracking
                if (receivedSections[sectionIndex]) {
                  const sec = receivedSections[sectionIndex];
                  const key = sec.questions ? 'questions' : sec.items ? 'items' : sec.pairs ? 'pairs' : 'questions';
                  if (!sec[key]) sec[key] = [];
                  sec[key][questionIndex] = question;
                }
                // Update store (idempotent — index-based, no duplicate risk)
                set((state) => {
                  if (!state.activeSession || !state.currentDay) return state;
                  const currentTask1 = (state.currentDay as any).task1;
                  if (!currentTask1?.sections?.[sectionIndex]) return state;

                  const section = { ...currentTask1.sections[sectionIndex] };
                  const key = section.questions ? 'questions' : section.items ? 'items' : section.pairs ? 'pairs' : 'questions';
                  const items = [...(section[key] || [])];
                  // Skip if already set (dedup for cached path emitting both question + section)
                  if (items[questionIndex]?.id === question.id) return state;
                  items[questionIndex] = question;
                  section[key] = items;

                  const updatedSections = [...currentTask1.sections];
                  updatedSections[sectionIndex] = section;
                  const updatedTask1 = { ...currentTask1, sections: updatedSections };
                  const updatedDays = state.activeSession.curriculum.days.map((d) =>
                    d.day === dayNumber ? { ...d, task1: updatedTask1 } : d
                  );
                  return {
                    activeSession: {
                      ...state.activeSession,
                      curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                    },
                    currentDay: { ...state.currentDay, task1: updatedTask1 },
                  };
                });
                break;
              }
              case 'task1Section': {
                // Section finalization — merge normalized IDs into existing section
                const { section: authoritative, index } = data;
                receivedSections[index] = authoritative;
                streamDelivered = true;
                set((state) => {
                  if (!state.activeSession || !state.currentDay) return state;
                  const currentTask1 = (state.currentDay as any).task1;

                  // If task1 structure doesn't exist yet (task1SectionStart didn't fire),
                  // create it now — backward compat with old backend or batched events
                  if (!currentTask1?.sections) {
                    const newTask1 = {
                      id: `day${dayNumber}-task1`,
                      format: 'sections' as const,
                      title: 'Practice',
                      description: '',
                      estimatedMinutes: 10,
                      passingScore: 0.7,
                      sections: [authoritative],
                    };
                    const updatedDays = state.activeSession.curriculum.days.map((d) => {
                      if (d.day !== dayNumber) return d;
                      const newStatus = (d.status === DayStatus.COMPLETED || d.status === DayStatus.SKIPPED)
                        ? d.status : DayStatus.IN_PROGRESS;
                      return { ...d, task1: newTask1, detailsLoaded: false, status: newStatus };
                    });
                    const newCurrentDay = dayNumber > state.activeSession.currentDay
                      ? dayNumber : state.activeSession.currentDay;
                    const newCurrentDayObj = updatedDays.find((d) => d.day === dayNumber)!;
                    return {
                      activeSession: {
                        ...state.activeSession,
                        currentDay: newCurrentDay,
                        curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                      },
                      currentDay: { ...newCurrentDayObj },
                      isDayLoading: false,
                      dayLoadingNumber: null,
                      isCoreLoaded: true,
                    };
                  }

                  const existing = currentTask1.sections[index];
                  const merged = { ...authoritative };
                  if (existing) {
                    const existKey = existing.questions ? 'questions' : existing.items ? 'items' : existing.pairs ? 'pairs' : null;
                    const authKey = authoritative.questions ? 'questions' : authoritative.items ? 'items' : authoritative.pairs ? 'pairs' : null;
                    if (existKey && authKey && existKey === authKey) {
                      const existingItems = existing[existKey] || [];
                      const authItems = authoritative[authKey] || [];
                      merged[authKey] = authItems.map((authQ: any, qi: number) => ({
                        ...authQ,
                        ...(existingItems[qi] ? { id: authQ.id || existingItems[qi].id } : {}),
                      }));
                    }
                  }

                  const updatedSections = [...currentTask1.sections];
                  updatedSections[index] = merged;
                  const updatedTask1 = { ...currentTask1, sections: updatedSections };
                  const updatedDays = state.activeSession.curriculum.days.map((d) =>
                    d.day === dayNumber ? { ...d, task1: updatedTask1 } : d
                  );
                  return {
                    activeSession: {
                      ...state.activeSession,
                      curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                    },
                    currentDay: { ...state.currentDay, task1: updatedTask1 },
                    isCoreLoaded: true,
                  };
                });
                break;
              }
              case 'complete': {
                const { coreContent, variantId, fromCache, task1Concepts } = data;

                // Final state update with complete content (authoritative)
                // Preserve the incrementally-streamed task1 instead of overwriting
                // with the batch version from coreContent. This prevents a visual
                // reset where streamed questions get replaced and re-rendered.
                set((state) => {
                  if (!state.activeSession) return state;

                  const updatedDays = state.activeSession.curriculum.days.map((d) => {
                    if (d.day !== dayNumber) return d;
                    const newStatus = (d.status === DayStatus.COMPLETED || d.status === DayStatus.SKIPPED)
                      ? d.status : DayStatus.IN_PROGRESS;
                    // If streaming already delivered task1 progressively, keep it
                    // to avoid overwriting the incrementally-built state
                    const existingTask1 = streamDelivered ? d.task1 : undefined;
                    const { task1: _batchTask1, ...coreContentWithoutTask1 } = coreContent;
                    return {
                      ...d,
                      ...coreContentWithoutTask1,
                      ...(existingTask1 ? { task1: existingTask1 } : { task1: coreContent.task1 }),
                      coreLoaded: true,
                      coreContent,
                      detailsLoaded: false,
                      status: newStatus,
                      variantId,
                      task1Concepts,
                    };
                  });

                  const newCurrentDay = dayNumber > state.activeSession.currentDay
                    ? dayNumber : state.activeSession.currentDay;
                  const newCurrentDayObj = updatedDays.find((d) => d.day === dayNumber)!;

                  return {
                    activeSession: {
                      ...state.activeSession,
                      currentDay: newCurrentDay,
                      curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                    },
                    currentDay: { ...newCurrentDayObj },
                    currentDayNumber: dayNumber,
                    isDayLoading: false,
                    dayLoadingNumber: null,
                    isCoreLoaded: true,
                    isStreamingComplete: true,
                    streamAbortController: null,
                    currentDayVariantId: variantId || null,
                    regenCount: 0,
                    regenLimit: 3,
                  };
                });

                resolve(coreContent);
                break;
              }
              case 'video': {
                // Set video data immediately so video step can be skipped during streaming
                set((state) => {
                  if (!state.activeSession || !state.currentDay) return state;
                  const updatedDays = state.activeSession.curriculum.days.map((d) =>
                    d.day === dayNumber ? { ...d, video: data } : d
                  );
                  return {
                    activeSession: {
                      ...state.activeSession,
                      curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                    },
                    currentDay: { ...state.currentDay, video: data },
                  };
                });
                break;
              }
              case 'error': {
                hasError = true;
                reject(new Error(data.error || 'Stream error'));
                break;
              }
              case 'task1': {
                // Complete task1 object — update store as authoritative task1
                // This arrives before 'complete' and ensures task1 is set
                // even if individual question events were missed or batched
                streamDelivered = true;
                set((state) => {
                  if (!state.activeSession || !state.currentDay) return state;
                  const currentTask1 = (state.currentDay as any).task1;
                  // If streaming already built the task1 progressively, keep it
                  // Only use this event's data if task1 hasn't been set yet
                  if (currentTask1?.sections?.length > 0) return state;

                  const updatedTask1 = {
                    id: `day${dayNumber}-task1`,
                    format: 'sections' as const,
                    ...data,
                  };
                  const updatedDays = state.activeSession.curriculum.days.map((d) =>
                    d.day === dayNumber ? { ...d, task1: updatedTask1 } : d
                  );
                  const newCurrentDayObj = updatedDays.find((d) => d.day === dayNumber)!;
                  return {
                    activeSession: {
                      ...state.activeSession,
                      curriculum: { ...state.activeSession.curriculum, days: updatedDays },
                    },
                    currentDay: { ...newCurrentDayObj },
                    isCoreLoaded: true,
                  };
                });
                break;
              }
              // Ignore other events (foundationCard, etc.) - handled in complete
            }
          },
          forceRegenerate,
        );

        set({ streamAbortController: controller });
      });

      return coreContentResult;
    } catch (streamError: any) {
      // Fallback: if stream failed and didn't deliver any content, use regular POST
      if (!streamDelivered) {
        console.warn('SSE stream failed, falling back to regular POST:', streamError.message);
        try {
          const response = await sessionService.startDayCore(activeSession.id, dayNumber, forceRegenerate);
          const coreContent = response.coreContent;
          const variantId = response.variantId;
          const regenCount = response.regenCount ?? 0;
          const regenLimit = response.regenLimit ?? 3;

          set((state) => {
            if (!state.activeSession) return state;

            const updatedDays = state.activeSession.curriculum.days.map((d) => {
              if (d.day !== dayNumber) return d;
              const newStatus = (d.status === DayStatus.COMPLETED || d.status === DayStatus.SKIPPED)
                ? d.status : DayStatus.IN_PROGRESS;
              return { ...d, ...coreContent, detailsLoaded: false, status: newStatus };
            });

            const existingDay = state.activeSession.curriculum.days.find((d) => d.day === dayNumber);
            const isNewDayContent = !existingDay?.detailsLoaded && !existingDay?.coreContent;
            const shouldResetSteps = isNewDayContent || forceRegenerate;
            const newCurrentDay = dayNumber > state.activeSession.currentDay
              ? dayNumber : state.activeSession.currentDay;
            const newCurrentDayObj = updatedDays.find((d) => d.day === dayNumber)!;

            return {
              activeSession: {
                ...state.activeSession,
                currentDay: newCurrentDay,
                curriculum: { ...state.activeSession.curriculum, days: updatedDays },
              },
              currentDay: { ...newCurrentDayObj },
              currentDayNumber: dayNumber,
              isDayLoading: false,
              dayLoadingNumber: null,
              isCoreLoaded: true,
              isStreamingComplete: true,
              streamAbortController: null,
              ...(shouldResetSteps ? {
                currentStep: 'prePrompt' as const,
                completedSteps: [],
                stepStartTime: new Date(),
              } : {}),
              currentDayVariantId: variantId || null,
              regenCount,
              regenLimit,
            };
          });

          return coreContent;
        } catch (fallbackError: any) {
          const isRateLimitError = fallbackError.response?.status === 429;
          if (isRateLimitError) {
            set({
              showRegenLimitModal: true,
              isRegenerating: false,
              isDayLoading: false,
              dayLoadingNumber: null,
              isStreamingComplete: true,
              streamAbortController: null,
            });
          } else {
            set({
              error: fallbackError.response?.data?.message || 'Failed to load core content',
              isDayLoading: false,
              dayLoadingNumber: null,
              isCoreLoaded: false,
              isStreamingComplete: true,
              streamAbortController: null,
            });
          }
          throw fallbackError;
        }
      }
      // Stream partially delivered content but errored - still mark complete
      set({ isStreamingComplete: true, streamAbortController: null });
      throw streamError;
    }
  },

  cleanupStream: () => {
    const { streamAbortController } = get();
    if (streamAbortController) streamAbortController.abort();
    set({ streamAbortController: null, isStreamingComplete: true });
  },

  loadDayDeferredContent: async (dayNumber: number, forceRegenerate?: boolean, retryCount = 0) => {
    const { activeSession, loadDayDeferredContent } = get();
    if (!activeSession) throw new Error('No active session');

    const MAX_RETRIES = 2; // Total 3 attempts (initial + 2 retries)
    const RETRY_DELAY_MS = 3000; // Wait 3 seconds between retries

    // Check if deferred content is already cached in session data (skip API call)
    // Deferred content (task1, reflection, etc.) is spread onto the day object, not in a nested deferredContent
    // Skip cache when forceRegenerate is true (regenerating content)
    if (!forceRegenerate) {
      const existingDay = activeSession.curriculum.days.find((d) => d.day === dayNumber);

      // Check if day has deferred content by looking at reflection or detailsLoaded flag
      // The content is spread directly onto the day, not nested in deferredContent
      if (existingDay?.detailsLoaded && (existingDay?.reflection || existingDay?.intensivePractice)) {
        // Reconstruct the deferred content from the day's top-level properties
        const cachedDeferredContent = {
          reflection: existingDay.reflection,
          intensivePractice: existingDay.intensivePractice,
          openTask: existingDay.openTask,
        } as DayDeferredContent;

        // Update zustand state AND merge into currentDay to reflect cached content
        set((state) => ({
          isDeferredLoaded: true,
          isDeferredLoading: false,
          deferredContent: cachedDeferredContent,
          currentDay: state.currentDay?.day === dayNumber
            ? { ...state.currentDay, ...cachedDeferredContent, detailsLoaded: true }
            : state.currentDay,
        }));
        return cachedDeferredContent;
      }
    }

    set({ isDeferredLoading: true });

    try {
      const response = await sessionService.loadDayDeferred(activeSession.id, dayNumber, forceRegenerate);
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
      // Check if this is a timeout error (524 Cloudflare, 504 Gateway, or network timeout)
      const isTimeoutError = error.response?.status === 524 ||
                            error.response?.status === 504 ||
                            error.code === 'ECONNABORTED' ||
                            error.message?.includes('timeout');

      // Retry on timeout errors if we haven't exceeded max retries
      if (isTimeoutError && retryCount < MAX_RETRIES) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

        // Preserve forceRegenerate on retry to avoid returning old cached content
        // during regeneration. The backend will return new content once generated.
        return loadDayDeferredContent(dayNumber, forceRegenerate, retryCount + 1);
      }

      // Final failure - update state but don't block UI
      console.error('Deferred content failed:', error.message || error);
      set({
        error: isTimeoutError
          ? 'Content generation is taking longer than expected. Some exercises may load later.'
          : (error.response?.data?.message || 'Failed to load deferred content'),
        isDeferredLoading: false,
      });
      throw error;
    }
  },

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
    const { streamAbortController } = get();
    if (streamAbortController) streamAbortController.abort();
    set({
      isCoreLoaded: false,
      isDeferredLoading: false,
      isDeferredLoaded: false,
      deferredContent: null,
      isStreamingComplete: true,
      streamAbortController: null,
    });
  },

  regenerateDayContent: async (dayNumber: number) => {
    const { activeSession, loadDayCoreContent, loadDayDeferredContent, regenCount, regenLimit } = get();
    if (!activeSession) throw new Error('No active session');

    // Check if rate limit already reached (client-side check)
    // Show upgrade modal for free users when limit reached
    if (regenCount >= regenLimit) {
      set({ showRegenLimitModal: true });
      throw new Error('Rate limit reached');
    }

    // IMPORTANT: Set isRegenerating FIRST before clearing content state
    // This prevents the SessionPage useEffect from seeing !isCoreLoaded && !isRegenerating
    // and triggering a cached content load during the brief window
    set({ isRegenerating: true, error: null });

    // Clear all local progress for this day immediately
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

      // Clear generated content fields so components show loading state
      // Keep prePrompt — it's from skeleton data (static) and prevents a UI flash
      const clearedCurrentDay = state.currentDay ? {
        ...state.currentDay,
        detailsLoaded: false,
        coreLoaded: false,
        // Clear generated content fields (prePrompt kept — skeleton data doesn't change)
        video: undefined,
        foundationCards: undefined,
        languageFoundationCards: undefined,
        // Clear deferred content fields
        task1: undefined,
        task2: undefined,
        reflection: undefined,
        intensivePractice: undefined,
        openTask: undefined,
        bossMilestone: undefined,
      } : null;

      return {
        taskProgress: newTaskProgress,
        alternativeTaskCache: newAlternativeTaskCache,
        // Reset step progress
        currentStep: 'prePrompt',
        completedSteps: [],
        stepStartTime: new Date(),
        // Clear current day content so section loaders show
        currentDay: clearedCurrentDay,
        deferredContent: null,
        isCoreLoaded: false,
        isDeferredLoaded: false,
      };
    });

    try {
      // Start content loading in background (don't await)
      // loadDayCoreContent sets prePrompt from skeleton data synchronously,
      // so PrePromptStep will render instantly once isRegenerating clears
      loadDayCoreContent(dayNumber, true).catch((err) => {
        console.error('Core content loading failed:', err.message);
      });

      // Start deferred loading in background
      loadDayDeferredContent(dayNumber, true).catch((err) => {
        console.error('Deferred content loading failed:', err.message);
      });

      // Show GeneratingScreen for 10s for visual feedback,
      // then transition to PrePromptStep with skeleton data
      await new Promise(resolve => setTimeout(resolve, 10000));
      set({ isRegenerating: false });
    } catch (err: any) {
      const is429 = err?.response?.status === 429 || err?.message === 'Rate limit reached';
      if (!is429) {
        set({ isRegenerating: false });
      }
    }
  },

  dismissRegenLimitModal: () => {
    set({ showRegenLimitModal: false });
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
    if (!activeSession?.curriculum?.days) return DayStatus.LOCKED;

    const day = activeSession.curriculum.days.find((d) => d.day === dayNumber);
    return day?.status || DayStatus.LOCKED;
  },

  canStartDay: (dayNumber: number) => {
    const { activeSession } = get();
    if (!activeSession?.curriculum?.days) return false;

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
    if (!activeSession?.curriculum?.days) return null;
    return activeSession.curriculum.days.find(d => d.day === activeSession.currentDay) || null;
  },

  getStepProgress: () => {
    const { completedSteps, currentDay, isDeferredLoaded, activeSession } = get();
    const stepOrder = getStepOrder(activeSession?.goalType as GoalType | undefined);
    let total = stepOrder.length;

    // bossMilestone is always shown (handles both boss projects and intensive practice)
    // So we don't subtract for it

    // openTask - subtract if explicitly not present (null) and not still loading
    // openTask comes from DEFERRED content (Haiku)
    const openTask = currentDay?.openTask;
    if (isDeferredLoaded && openTask === null) total -= 1;

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
