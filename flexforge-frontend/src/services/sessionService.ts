import api from './api';
import type {
  Session,
  CreateSessionDto,
  UpdateSessionDto,
  SessionResponse,
  ProgressStats,
  StartDayResponse,
  SkipTestResponse,
  PracticeSubmitResponse,
  DayDetailsResponse,
} from '@/types';

export const sessionService = {
  /**
   * Create new learning session with AI-generated curriculum
   */
  async create(dto: CreateSessionDto): Promise<SessionResponse> {
    const { data } = await api.post<SessionResponse>('/sessions', dto);
    return data;
  },

  /**
   * Get all sessions for current user
   */
  async getAll(): Promise<{ count: number; sessions: Session[] }> {
    const { data } = await api.get<{ count: number; sessions: Session[] }>('/sessions');
    return data;
  },

  /**
   * Get current active session
   */
  async getActive(): Promise<{ session: Session | null; message?: string }> {
    const { data } = await api.get<{ session: Session | null; message?: string }>('/sessions/active');
    return data;
  },

  /**
   * Get single session by ID
   */
  async getById(id: string): Promise<{ session: Session }> {
    const { data } = await api.get<{ session: Session }>(`/sessions/${id}`);
    return data;
  },

  /**
   * Get session progress summary
   */
  async getProgress(id: string): Promise<{
    session: Session;
    progressPercentage: number;
    tasksCompleted: number;
    totalTasks: number;
    daysCompleted: number;
    daysRemaining: number;
    averageConfidence: number;
    weakAreas?: string[];
    strongAreas?: string[];
  }> {
    const { data } = await api.get(`/sessions/${id}/progress`);
    return data;
  },

  /**
   * Update session (status, mode, current day)
   */
  async update(id: string, dto: UpdateSessionDto): Promise<{ message: string; session: Session }> {
    const { data } = await api.patch<{ message: string; session: Session }>(`/sessions/${id}`, dto);
    return data;
  },

  /**
   * Delete session
   */
  async delete(id: string): Promise<{ message: string }> {
    const { data } = await api.delete<{ message: string }>(`/sessions/${id}`);
    return data;
  },

  /**
   * Advance to next day
   */
  async advanceDay(id: string): Promise<{ message: string; session: Session }> {
    return this.update(id, { currentDay: undefined }); // Backend handles increment
  },

  // ═══════════════════════════════════════════════════
  // TWO-PHASE CURRICULUM METHODS
  // ═══════════════════════════════════════════════════

  /**
   * Start a day - generates full day content (Phase 2)
   * Day 1: Always available
   * Day 2+: Requires previous day's practice project submitted
   */
  async startDay(sessionId: string, dayNumber: number): Promise<StartDayResponse> {
    const { data } = await api.post<StartDayResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/start`
    );
    return data;
  },

  /**
   * Submit skip test answers to skip a day
   * If passed (2/3 correct), day is marked as skipped/mastered
   */
  async submitSkipTest(
    sessionId: string,
    dayNumber: number,
    answers: string[]
  ): Promise<SkipTestResponse> {
    const { data } = await api.post<SkipTestResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/skip-test`,
      { answers }
    );
    return data;
  },

  /**
   * Submit practice project answer - unlocks next day
   */
  async submitPracticeProject(
    sessionId: string,
    dayNumber: number,
    answer: string,
    confidence?: number
  ): Promise<PracticeSubmitResponse> {
    const { data } = await api.post<PracticeSubmitResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/practice/submit`,
      { answer, confidence }
    );
    return data;
  },

  /**
   * Get day details (if already loaded)
   */
  async getDayDetails(
    sessionId: string,
    dayNumber: number
  ): Promise<DayDetailsResponse> {
    const { data } = await api.get<DayDetailsResponse>(
      `/sessions/${sessionId}/days/${dayNumber}`
    );
    return data;
  },
};
