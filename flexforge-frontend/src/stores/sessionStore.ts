import { create } from 'zustand';
import type {
  Session,
  CreateSessionDto,
  SessionStatus,
  SessionMode,
  CurriculumDay,
  Progress,
  SessionStep,
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

  // Progress actions
  fetchProgress: (sessionId: string) => Promise<void>;
  updateTaskProgress: (taskId: string, updates: { completed?: boolean; confidenceScore?: number; timeSpentMinutes?: number }) => Promise<void>;

  // Helpers
  getCurrentDayData: () => CurriculumDay | null;
  getStepProgress: () => { current: number; total: number };
  clearError: () => void;
}

const STEP_ORDER: SessionStep[] = [
  'prePrompt',
  'video',
  'activeRecall',
  'memoryBridge',
  'conceptCheck',
  'task1',
  'bossMilestone',
  'reflection',
];

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

    const newCompletedSteps = [...completedSteps, step];
    const currentIndex = STEP_ORDER.indexOf(step);
    
    // Find next step (skip memoryBridge on day 1, skip bossMilestone if not present)
    let nextStep = STEP_ORDER[currentIndex + 1];
    
    // Skip memoryBridge on day 1
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

  // Helpers
  getCurrentDayData: () => {
    const { activeSession } = get();
    if (!activeSession) return null;
    return activeSession.curriculum.days.find(d => d.day === activeSession.currentDay) || null;
  },

  getStepProgress: () => {
    const { completedSteps, currentDay } = get();
    let total = STEP_ORDER.length;
    
    // Adjust total based on what's available
    if (currentDay?.day === 1) total -= 1; // No memory bridge
    if (!currentDay?.bossMilestone) total -= 1; // No boss milestone
    
    return {
      current: completedSteps.length,
      total,
    };
  },

  clearError: () => set({ error: null }),
}));
