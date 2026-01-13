import api from './api';
import type {
  Session,
  CreateSessionDto,
  UpdateSessionDto,
  SessionResponse,
  ProgressStats,
  StartDayResponse,
  StartDayCoreResponse,
  LoadDayDeferredResponse,
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
   * Start a day - CORE content only (fast initial load)
   * Returns: prePrompt, video, foundationCards, task1
   */
  async startDayCore(sessionId: string, dayNumber: number): Promise<StartDayCoreResponse> {
    const { data } = await api.post<StartDayCoreResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/start-core`
    );
    return data;
  },

  /**
   * Load deferred content in background
   * Returns: task2, practiceProject, reflection, skipTest
   */
  async loadDayDeferred(sessionId: string, dayNumber: number): Promise<LoadDayDeferredResponse> {
    const { data } = await api.post<LoadDayDeferredResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/load-deferred`
    );
    return data;
  },

  /**
   * Submit skip test answers to skip a day (multiple choice)
   * Must get all correct to skip
   */
  async submitSkipTest(
    sessionId: string,
    dayNumber: number,
    answers: number[]
  ): Promise<SkipTestResponse> {
    const { data } = await api.post<SkipTestResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/skip-test`,
      { answers }
    );
    return data;
  },

  /**
   * Force skip a day without passing the test
   */
  async forceSkipDay(
    sessionId: string,
    dayNumber: number
  ): Promise<{ success: boolean; message: string; nextDayUnlocked: boolean }> {
    const { data } = await api.post(
      `/sessions/${sessionId}/days/${dayNumber}/force-skip`
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

  /**
   * Get task in alternative format (on-demand generation)
   * Converts between code, quiz, and fillBlank formats
   */
  async getAlternativeTaskFormat(
    sessionId: string,
    dayNumber: number,
    format: 'code' | 'quiz' | 'fillBlank'
  ): Promise<{
    message: string;
    task: any;
    tokensUsed: number;
    fromCache: boolean;
  }> {
    const { data } = await api.post(
      `/sessions/${sessionId}/days/${dayNumber}/task-format`,
      { format }
    );
    return data;
  },

  // ═══════════════════════════════════════════════════
  // CURRICULUM CACHE TRACKING
  // ═══════════════════════════════════════════════════

  /**
   * Record that user clicked "Generate New" (regeneration signal)
   * Call this BEFORE creating a new session when user rejects previous curriculum
   */
  async markRegenerated(
    previousVariantId: string,
    sessionId: string
  ): Promise<void> {
    await api.post('/curriculum/mark-regenerated', {
      previousVariantId,
      sessionId,
    });
  },

  /**
   * Record Day 1 completion (positive signal for cache quality)
   */
  async recordDay1Completion(
    variantId: string,
    sessionId: string
  ): Promise<void> {
    await api.post('/curriculum/complete-day', {
      variantId,
      sessionId,
    });
  },

  /**
   * Record bounce (user left quickly - negative signal)
   * Use with navigator.sendBeacon for reliability
   */
  async recordBounce(
    variantId: string,
    sessionId: string
  ): Promise<void> {
    await api.post('/curriculum/bounce', {
      variantId,
      sessionId,
    });
  },

  /**
   * Get cache stats (debug/admin)
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    totalVariants: number;
    activeVariants: number;
    winners: number;
    totalServes: number;
    avgRegenRate: number;
  }> {
    const { data } = await api.get('/curriculum/cache-stats');
    return data;
  },

  // ═══════════════════════════════════════════════════
  // AI TUTOR
  // ═══════════════════════════════════════════════════

  /**
   * Ask the AI tutor for help with a task
   * The tutor guides without giving away answers
   */
  async askAiTutor(
    sessionId: string,
    params: {
      message: string;
      dayNumber: number;
      context: {
        taskTitle?: string;
        taskDescription?: string;
        currentCode?: string;
        concept?: string;
      };
      conversationHistory?: Array<{ role: string; content: string }>;
    }
  ): Promise<{ reply: string; tokensUsed?: number }> {
    const { data } = await api.post<{
      reply: string;
      metadata?: { tokensUsed: number; cost: number };
    }>('/curriculum/ai-tutor', params);
    return {
      reply: data.reply,
      tokensUsed: data.metadata?.tokensUsed,
    };
  },

  /**
   * Find a new video for a day using Layer 3 deep verification
   * Called when user exhausts the alternative and clicks "Find New Video" again
   */
  async refreshVideo(params: {
    sessionId: string;
    dayNumber: number;
    concept: string;
    skillLevel: string;
    excludeVideoIds?: string[];
  }): Promise<{
    message: string;
    video: {
      videoId: string;
      title: string;
      channelName?: string;
      url: string;
      startTime?: string;
      endTime?: string;
      watchInstructions?: string;
      estimatedMinutes: number;
      matchPercent?: number;
      keyTopics?: string[];
      whyThisVideo?: string[];
      contentType?: {
        type: 'CONCEPT' | 'TOOL_SPECIFIC' | 'MIXED';
        toolsMentioned?: string[];
        reason?: string;
      };
      alternatives?: Array<{
        videoId: string;
        title: string;
        channelName?: string;
        startTime?: string;
        endTime?: string;
        estimatedMinutes?: number;
        differentiator: string;
        matchPercent: number;
        contentType?: {
          type: 'CONCEPT' | 'TOOL_SPECIFIC' | 'MIXED';
          toolsMentioned?: string[];
        };
      }>;
    };
  }> {
    const { data } = await api.post('/curriculum/refresh-video', params);
    return data;
  },
};
