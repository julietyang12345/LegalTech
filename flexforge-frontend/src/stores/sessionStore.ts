import { create } from 'zustand';
import {
  DayStatus,
  type Session,
  type CreateSessionDto,
  type SessionStatus,
  type SessionMode,
  type CurriculumDay,
  type Progress,
  type SessionStep,
  type SkipTestResponse,
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

  // Actions
  createSession: (dto: CreateSessionDto) => Promise<Session>;
  fetchSessions: () => Promise<void>;
  fetchActiveSession: () => Promise<void>;
  setActiveSession: (session: Session | null) => void;
  updateSession: (id: string, updates: { status?: SessionStatus; mode?: SessionMode; currentDay?: number }) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // Focus mode actions
  startDay: (dayNumber: number) => void;
  setCurrentStep: (step: SessionStep) => void;
  completeStep: (step: SessionStep) => void;
  resetSteps: () => void;

  // Two-phase curriculum actions
  loadDayContent: (dayNumber: number) => Promise<CurriculumDay>;
  submitSkipTest: (dayNumber: number, answers: number[]) => Promise<SkipTestResponse>;
  forceSkipDay: (dayNumber: number) => Promise<{ success: boolean; nextDayUnlocked: boolean }>;
  submitPracticeProject: (dayNumber: number, answer: string, confidence?: number) => Promise<PracticeSubmitResponse>;
  getDayStatus: (dayNumber: number) => DayStatus;
  canStartDay: (dayNumber: number) => boolean;

  // Split loading actions (core + deferred)
  loadDayCoreContent: (dayNumber: number) => Promise<DayCoreContent>;
  loadDayDeferredContent: (dayNumber: number) => Promise<DayDeferredContent>;
  loadDayContentSplit: (dayNumber: number) => Promise<CurriculumDay>;
  getDeferredContent: () => DayDeferredContent | null;
  resetSplitLoadingState: () => void;

  // Alternative task format actions
  getAlternativeTaskFormat: (dayNumber: number, format: 'code' | 'quiz' | 'fillBlank') => Promise<any>;
  alternativeTaskLoading: boolean;
  alternativeTaskCache: Record<string, any>; // key: "day-format", value: task

  // Progress actions
  fetchProgress: (sessionId: string) => Promise<void>;
  updateTaskProgress: (taskId: string, updates: { completed?: boolean; confidenceScore?: number; timeSpentMinutes?: number }) => Promise<void>;

  // Helpers
  getCurrentDayData: () => CurriculumDay | null;
  getStepProgress: () => { current: number; total: number };
  clearError: () => void;
}

// New flow with foundation cards
const STEP_ORDER_NEW: SessionStep[] = [
  'prePrompt',
  'video',
  'foundationCards',
  'task1',
  'bossMilestone',
  'reflection',
];

// Legacy flow for backward compatibility
const STEP_ORDER_LEGACY: SessionStep[] = [
  'prePrompt',
  'video',
  'activeRecall',
  'memoryBridge',
  'conceptCheck',
  'task1',
  'bossMilestone',
  'reflection',
];

// Helper to get appropriate step order based on day content
const getStepOrder = (day: CurriculumDay | null): SessionStep[] => {
  const hasFoundationCards = day?.foundationCards && day.foundationCards.length > 0;
  return hasFoundationCards ? STEP_ORDER_NEW : STEP_ORDER_LEGACY;
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

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  sessions: [],
  isLoading: false,
  error: null,

  currentDay: null,
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

  // Alternative task format state
  alternativeTaskLoading: false,
  alternativeTaskCache: {},

  createSession: async (dto: CreateSessionDto) => {
    set({ isLoading: true, error: null });
    try {
      const response = await sessionService.create(dto);
      set((state) => ({
        activeSession: response.session,
        sessions: [response.session, ...state.sessions],
        isLoading: false,
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
    const { activeSession } = get();
    if (!activeSession) return;

    const dayData = activeSession.curriculum.days.find(d => d.day === dayNumber);

    // Merge saved day content into top level for refresh
    // Backend saves to: coreContent (video, foundationCards, task1) + deferredContent (task2, practiceProject, etc.)
    // Frontend expects flat structure: day.video, day.foundationCards, etc.
    if (!dayData) {
      set({ currentDay: null, currentStep: 'prePrompt', completedSteps: [], stepStartTime: new Date() });
      return;
    }

    const mergedDay: CurriculumDay = {
      ...dayData,
      ...(dayData.coreContent as object),
      ...(dayData.deferredContent as object),
    };

    set({
      currentDay: mergedDay,
      currentStep: 'prePrompt',
      completedSteps: [],
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

    const STEP_ORDER = getStepOrder(currentDay);
    const currentIndex = STEP_ORDER.indexOf(step);

    // Find next step (skip memoryBridge on day 1, skip bossMilestone if not present)
    let nextStep = STEP_ORDER[currentIndex + 1];

    // Skip memoryBridge on day 1 (only relevant in legacy flow)
    if (nextStep === 'memoryBridge' && currentDay?.day === 1) {
      nextStep = STEP_ORDER[currentIndex + 2];
    }

    // Skip bossMilestone if not present
    if (nextStep === 'bossMilestone' && !currentDay?.bossMilestone) {
      nextStep = STEP_ORDER[currentIndex + 2];
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

  // Two-phase curriculum actions
  loadDayContent: async (dayNumber: number) => {
    const { activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    set({ isDayLoading: true, dayLoadingNumber: dayNumber, error: null });

    try {
      const response = await sessionService.startDay(activeSession.id, dayNumber);
      const dayContent = response.dayContent;

      // Update the curriculum day with full content
      set((state) => {
        if (!state.activeSession) return state;

        const updatedDays = state.activeSession.curriculum.days.map((d) => {
          if (d.day !== dayNumber) return d;
          // Preserve COMPLETED/SKIPPED status when revisiting - only set IN_PROGRESS if UNLOCKABLE
          const newStatus = (d.status === DayStatus.COMPLETED || d.status === DayStatus.SKIPPED)
            ? d.status
            : DayStatus.IN_PROGRESS;
          return { ...d, ...dayContent, detailsLoaded: true, status: newStatus };
        });

        return {
          activeSession: {
            ...state.activeSession,
            curriculum: {
              ...state.activeSession.curriculum,
              days: updatedDays,
            },
          },
          currentDay: dayContent,
          isDayLoading: false,
          dayLoadingNumber: null,
        };
      });

      return dayContent;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to load day content',
        isDayLoading: false,
        dayLoadingNumber: null,
      });
      throw error;
    }
  },

  // ═══════════════════════════════════════════════════
  // SPLIT LOADING ACTIONS (Core + Deferred)
  // ═══════════════════════════════════════════════════

  loadDayCoreContent: async (dayNumber: number) => {
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
      const response = await sessionService.startDayCore(activeSession.id, dayNumber);
      const coreContent = response.coreContent;

      // Update the curriculum day with core content
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

        return {
          activeSession: {
            ...state.activeSession,
            curriculum: {
              ...state.activeSession.curriculum,
              days: updatedDays,
            },
          },
          currentDay: { ...updatedDays.find((d) => d.day === dayNumber)! },
          isDayLoading: false,
          dayLoadingNumber: null,
          isCoreLoaded: true,
        };
      });

      return coreContent;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to load core content',
        isDayLoading: false,
        dayLoadingNumber: null,
        isCoreLoaded: false,
      });
      throw error;
    }
  },

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

        const updatedCurrentDay = updatedDays.find((d) => d.day === dayNumber);

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

  loadDayContentSplit: async (dayNumber: number) => {
    const { loadDayCoreContent, loadDayDeferredContent, activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    // Load core content first (fast)
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

  submitSkipTest: async (dayNumber: number, answers: number[]) => {
    const { activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    try {
      const result = await sessionService.submitSkipTest(activeSession.id, dayNumber, answers);

      if (result.passed) {
        // Update day status to skipped and unlock next day
        set((state) => {
          if (!state.activeSession) return state;

          const updatedDays = updateDayStatuses(state.activeSession.curriculum.days, [
            { dayNumber, status: DayStatus.SKIPPED },
            { dayNumber: dayNumber + 1, status: DayStatus.UNLOCKABLE },
          ]);

          return {
            activeSession: {
              ...state.activeSession,
              curriculum: {
                ...state.activeSession.curriculum,
                days: updatedDays,
              },
            },
          };
        });
      } else if (result.newQuestions) {
        // Failed but have another question set: increment currentSetIndex
        set((state) => {
          if (!state.activeSession) return state;

          const updatedDays = state.activeSession.curriculum.days.map((d) => {
            if (d.day === dayNumber && d.skipTest?.questionSets) {
              const currentSetIndex = d.skipTest.currentSetIndex ?? 0;
              return {
                ...d,
                skipTest: {
                  ...d.skipTest,
                  currentSetIndex: currentSetIndex + 1,
                },
              };
            }
            return d;
          });

          return {
            activeSession: {
              ...state.activeSession,
              curriculum: {
                ...state.activeSession.curriculum,
                days: updatedDays,
              },
            },
          };
        });
      }
      // If allSetsExhausted, no state update needed - user must complete day or force skip

      return result;
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to submit skip test' });
      throw error;
    }
  },

  forceSkipDay: async (dayNumber: number) => {
    const { activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    try {
      const result = await sessionService.forceSkipDay(activeSession.id, dayNumber);

      if (result.success) {
        set((state) => {
          if (!state.activeSession) return state;

          const updates = [{ dayNumber, status: DayStatus.SKIPPED }];
          if (result.nextDayUnlocked) {
            updates.push({ dayNumber: dayNumber + 1, status: DayStatus.UNLOCKABLE });
          }

          const updatedDays = updateDayStatuses(state.activeSession.curriculum.days, updates);

          return {
            activeSession: {
              ...state.activeSession,
              // Advance currentDay if next day was unlocked
              currentDay: result.nextDayUnlocked ? dayNumber + 1 : state.activeSession.currentDay,
              curriculum: {
                ...state.activeSession.curriculum,
                days: updatedDays,
              },
            },
          };
        });
      }

      return result;
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to skip day' });
      throw error;
    }
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

      if (result.nextDayUnlocked) {
        // Update day status to completed, unlock next day, and advance currentDay
        set((state) => {
          if (!state.activeSession) return state;

          const updatedDays = updateDayStatuses(state.activeSession.curriculum.days, [
            { dayNumber, status: DayStatus.COMPLETED },
            { dayNumber: dayNumber + 1, status: DayStatus.UNLOCKABLE },
          ]);

          return {
            activeSession: {
              ...state.activeSession,
              // Advance currentDay to next day (matches backend behavior)
              currentDay: dayNumber + 1,
              curriculum: {
                ...state.activeSession.curriculum,
                days: updatedDays,
              },
            },
          };
        });
      }

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
    const STEP_ORDER = getStepOrder(currentDay);
    let total = STEP_ORDER.length;

    // Adjust total based on what's available
    if (currentDay?.day === 1 && STEP_ORDER.includes('memoryBridge')) total -= 1; // No memory bridge on day 1 (legacy)
    if (!currentDay?.bossMilestone) total -= 1; // No boss milestone

    return {
      current: completedSteps.length,
      total,
    };
  },

  clearError: () => set({ error: null }),
}));
