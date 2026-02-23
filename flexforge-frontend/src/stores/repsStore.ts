import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Rep, RepScenario, RepCoachMessage } from '@/types';
import { repsService } from '@/services/repsService';

type RepsPhase = 'intake' | 'loading' | 'scenarios' | 'practice' | 'completing' | 'feedback';

interface RepsState {
  // Flow state
  phase: RepsPhase;
  needsIntake: boolean | null;

  // Scenarios
  scenarios: RepScenario[];
  isGenerating: boolean;

  // Active rep
  activeRep: Rep | null;

  // Practice state (persisted)
  tasksCompleted: string[];
  scratchPadContent: string;
  timerSeconds: number;
  timerRunning: boolean;

  // Coach
  coachMessages: RepCoachMessage[];
  isCoachLoading: boolean;

  // Hints
  isHintLoading: boolean;

  // Feedback
  isCompleting: boolean;

  // History
  repHistory: Rep[];

  // Error
  error: string | null;

  // Actions
  checkIntake: () => Promise<void>;
  saveIntake: (dto: { background: string; target: string; struggle: string }) => Promise<void>;
  generateScenarios: (dto?: { skillName?: string; topic?: string; sourceSessionId?: string; sourceConcept?: string }) => Promise<void>;
  selectScenario: (scenario: RepScenario) => Promise<void>;
  toggleTask: (taskId: string) => void;
  setScratchPad: (content: string) => void;
  tickTimer: () => void;
  setTimerRunning: (running: boolean) => void;
  requestHint: (taskIndex: number) => Promise<void>;
  sendCoachMessage: (message: string) => Promise<void>;
  completeRep: (confidenceScore?: number) => Promise<void>;
  fetchHistory: () => Promise<void>;
  resetFlow: () => void;
  setPhase: (phase: RepsPhase) => void;
  clearError: () => void;
}

const initialPracticeState = {
  tasksCompleted: [] as string[],
  scratchPadContent: '',
  timerSeconds: 0,
  timerRunning: false,
  coachMessages: [] as RepCoachMessage[],
};

export const useRepsStore = create<RepsState>()(
  persist(
    (set, get) => ({
      // Initial state
      phase: 'loading' as RepsPhase,
      needsIntake: null,
      scenarios: [],
      isGenerating: false,
      activeRep: null,
      ...initialPracticeState,
      isCoachLoading: false,
      isHintLoading: false,
      isCompleting: false,
      repHistory: [],
      error: null,

      checkIntake: async () => {
        try {
          const { needsIntake } = await repsService.checkIntake();
          set({
            needsIntake,
            phase: needsIntake ? 'intake' : 'loading',
          });
        } catch (error: any) {
          set({ error: error?.response?.data?.message || error.message });
        }
      },

      saveIntake: async (dto) => {
        try {
          await repsService.saveIntake(dto);
          set({ needsIntake: false, phase: 'loading' });
        } catch (error: any) {
          set({ error: error?.response?.data?.message || error.message });
        }
      },

      generateScenarios: async (dto = {}) => {
        set({ isGenerating: true, error: null, phase: 'loading' });
        try {
          const { scenarios } = await repsService.generateScenarios(dto);
          set({ scenarios, isGenerating: false, phase: 'scenarios' });
        } catch (error: any) {
          set({
            isGenerating: false,
            error: error?.response?.data?.message || error.message,
            phase: 'scenarios',
          });
        }
      },

      selectScenario: async (scenario) => {
        set({ error: null });
        try {
          const { rep } = await repsService.startRep(scenario);
          set({
            activeRep: rep,
            phase: 'practice',
            ...initialPracticeState,
          });
        } catch (error: any) {
          set({ error: error?.response?.data?.message || error.message });
        }
      },

      toggleTask: (taskId) => {
        const { tasksCompleted } = get();
        if (tasksCompleted.includes(taskId)) {
          set({ tasksCompleted: tasksCompleted.filter(id => id !== taskId) });
        } else {
          set({ tasksCompleted: [...tasksCompleted, taskId] });
        }
      },

      setScratchPad: (content) => set({ scratchPadContent: content }),

      tickTimer: () => set(state => ({ timerSeconds: state.timerSeconds + 1 })),

      setTimerRunning: (running) => set({ timerRunning: running }),

      requestHint: async (taskIndex) => {
        const { activeRep } = get();
        if (!activeRep) return;

        set({ isHintLoading: true });
        try {
          const result = await repsService.getHint(activeRep.id, taskIndex);
          // Update the active rep with new hint data
          set(state => ({
            isHintLoading: false,
            activeRep: state.activeRep ? {
              ...state.activeRep,
              hintsUsed: state.activeRep.hintsUsed + 1,
              hintsRevealed: [
                ...state.activeRep.hintsRevealed,
                {
                  taskIndex,
                  level: result.level,
                  hint: result.hint,
                  encouragement: result.encouragement,
                },
              ],
            } : null,
          }));
        } catch (error: any) {
          set({
            isHintLoading: false,
            error: error?.response?.data?.message || error.message,
          });
        }
      },

      sendCoachMessage: async (message) => {
        const { activeRep } = get();
        if (!activeRep) return;

        const now = new Date().toISOString();
        const userMsg: RepCoachMessage = { role: 'user', content: message, timestamp: now };

        set(state => ({
          coachMessages: [...state.coachMessages, userMsg],
          isCoachLoading: true,
        }));

        try {
          const { reply } = await repsService.sendCoachMessage(activeRep.id, message);
          const assistantMsg: RepCoachMessage = {
            role: 'assistant',
            content: reply,
            timestamp: new Date().toISOString(),
          };
          set(state => ({
            coachMessages: [...state.coachMessages, assistantMsg],
            isCoachLoading: false,
          }));
        } catch (error: any) {
          set({
            isCoachLoading: false,
            error: error?.response?.data?.message || error.message,
          });
        }
      },

      completeRep: async (confidenceScore) => {
        const { activeRep, scratchPadContent, tasksCompleted } = get();
        if (!activeRep) return;

        set({ isCompleting: true, phase: 'completing' });
        try {
          const { feedback, rep } = await repsService.completeRep(activeRep.id, {
            scratchPadContent,
            confidenceScore,
            tasksCompleted,
          });
          set({
            activeRep: rep,
            isCompleting: false,
            phase: 'feedback',
          });
        } catch (error: any) {
          set({
            isCompleting: false,
            phase: 'practice',
            error: error?.response?.data?.message || error.message,
          });
        }
      },

      fetchHistory: async () => {
        try {
          const { reps } = await repsService.getHistory();
          set({ repHistory: reps });
        } catch (error: any) {
          console.error('Failed to fetch rep history:', error);
        }
      },

      resetFlow: () => {
        set({
          phase: 'loading',
          scenarios: [],
          activeRep: null,
          ...initialPracticeState,
          isCoachLoading: false,
          isHintLoading: false,
          isCompleting: false,
          error: null,
        });
      },

      setPhase: (phase) => set({ phase }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'reps-store',
      partialize: (state) => ({
        // Only persist practice-critical state
        tasksCompleted: state.tasksCompleted,
        scratchPadContent: state.scratchPadContent,
        timerSeconds: state.timerSeconds,
        activeRep: state.activeRep,
        phase: state.phase,
        coachMessages: state.coachMessages,
      }),
    },
  ),
);
