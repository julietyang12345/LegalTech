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
  submitSkipTest: (dayNumber: number, answers: string[]) => Promise<SkipTestResponse>;
  submitPracticeProject: (dayNumber: number, answer: string, confidence?: number) => Promise<PracticeSubmitResponse>;
  getDayStatus: (dayNumber: number) => DayStatus;
  canStartDay: (dayNumber: number) => boolean;

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
    set({
      currentDay: dayData || null,
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
    if (completedSteps.includes(step)) return;

    const STEP_ORDER = getStepOrder(currentDay);
    const newCompletedSteps = [...completedSteps, step];
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

        const updatedDays = state.activeSession.curriculum.days.map((d) =>
          d.day === dayNumber
            ? { ...d, ...dayContent, detailsLoaded: true, status: DayStatus.IN_PROGRESS }
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

  submitSkipTest: async (dayNumber: number, answers: string[]) => {
    const { activeSession } = get();
    if (!activeSession) throw new Error('No active session');

    try {
      const result = await sessionService.submitSkipTest(activeSession.id, dayNumber, answers);

      if (result.passed) {
        // Update day status to skipped and unlock next day
        set((state) => {
          if (!state.activeSession) return state;

          const updatedDays = state.activeSession.curriculum.days.map((d) => {
            if (d.day === dayNumber) {
              return { ...d, status: DayStatus.SKIPPED };
            }
            if (d.day === dayNumber + 1) {
              return { ...d, status: DayStatus.UNLOCKABLE };
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

      return result;
    } catch (error: any) {
      set({ error: error.response?.data?.message || 'Failed to submit skip test' });
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
        // Update day status to completed and unlock next day
        set((state) => {
          if (!state.activeSession) return state;

          const updatedDays = state.activeSession.curriculum.days.map((d) => {
            if (d.day === dayNumber) {
              return { ...d, status: DayStatus.COMPLETED };
            }
            if (d.day === dayNumber + 1) {
              return { ...d, status: DayStatus.UNLOCKABLE };
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

    // Can start if status is 'unlockable' or 'in_progress'
    return day.status === DayStatus.UNLOCKABLE || day.status === DayStatus.IN_PROGRESS;
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
