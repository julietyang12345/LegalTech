import { create } from 'zustand';

export type ShareScope = 'course' | 'task' | 'question';

export interface ShareQuestionData {
  question: string;
  options?: string[];
  correctAnswer?: string;
}

export interface ShareData {
  // Share scope - default to course
  scope: ShareScope;

  // Session/Course info
  sessionId: string;
  skillName: string;
  skillLevel: string;
  durationDays: number;
  currentDay: number;
  progress: number; // percentage

  // Task-specific (when scope is 'task')
  dayNumber: number;
  taskTitle: string;
  taskDescription?: string;
  code?: string;
  notes?: string;

  // Question-specific (when scope is 'question')
  questionData?: ShareQuestionData;

  // State
  currentState: 'started' | 'in-progress' | 'paused' | 'completed';
}

interface CommunityShareState {
  shareData: ShareData | null;

  // Actions
  setShareData: (data: ShareData) => void;
  clearShareData: () => void;
}

export const useCommunityShareStore = create<CommunityShareState>((set) => ({
  shareData: null,

  setShareData: (data) => set({ shareData: data }),
  clearShareData: () => set({ shareData: null }),
}));
