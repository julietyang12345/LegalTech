import api from './api';
import type {
  Session,
  CreateSessionDto,
  UpdateSessionDto,
  SessionResponse,
  StartDayCoreResponse,
  LoadDayDeferredResponse,
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
   * Includes cache-busting timestamp to ensure fresh data
   */
  async getActive(): Promise<{ session: Session | null; message?: string }> {
    const { data } = await api.get<{ session: Session | null; message?: string }>(
      `/sessions/active?_t=${Date.now()}`
    );
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
   * Start a day - CORE content only (fast initial load)
   * Returns: prePrompt, video, foundationCards, task1
   * @param forceRegenerate - If true, regenerates content even if already cached
   */
  async startDayCore(sessionId: string, dayNumber: number, forceRegenerate?: boolean): Promise<StartDayCoreResponse> {
    const { data } = await api.post<StartDayCoreResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/start-core`,
      { forceRegenerate }
    );
    return data;
  },

  /**
   * Start a day with SSE streaming - foundation cards appear in real-time
   * Events: prePrompt, foundationCard (multiple), video, complete, error
   * @param onEvent - Callback for each streamed event
   * @returns Cleanup function to close the connection
   */
  startDayCoreStream(
    sessionId: string,
    dayNumber: number,
    onEvent: (event: { type: string; data: any }) => void,
    onComplete?: (result: { coreContent: any; tokensUsed: number; fromCache: boolean; variantId?: string }) => void,
    onError?: (error: string) => void
  ): () => void {
    const token = localStorage.getItem('auth_token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
    const url = `${baseUrl}/sessions/${sessionId}/days/${dayNumber}/start-core-stream`;

    // Create EventSource with auth header via fetch (EventSource doesn't support headers)
    // We'll use fetch with ReadableStream instead
    const controller = new AbortController();

    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));
                const eventType = eventData.event || eventData.type;
                const data = eventData.data;

                // Call event handler
                onEvent({ type: eventType, data });

                // Handle completion
                if (eventType === 'complete' && onComplete) {
                  onComplete(data);
                }

                // Handle error
                if (eventType === 'error' && onError) {
                  onError(data?.error || 'Unknown streaming error');
                }
              } catch (e) {
                console.warn('[SSE] Failed to parse event:', line, e);
              }
            }
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('[SSE] Stream error:', error);
          if (onError) {
            onError(error.message || 'Stream connection failed');
          }
        }
      });

    // Return cleanup function
    return () => {
      controller.abort();
    };
  },

  /**
   * Load deferred content in background
   * Returns: reflection
   */
  async loadDayDeferred(sessionId: string, dayNumber: number): Promise<LoadDayDeferredResponse> {
    const { data } = await api.post<LoadDayDeferredResponse>(
      `/sessions/${sessionId}/days/${dayNumber}/load-deferred`
    );
    return data;
  },

  /**
   * Load deferred content with SSE streaming
   * Events: task1, bossMilestone, intensivePractice, openTask, reflection, complete, error
   * @param onEvent - Callback for each streamed event
   * @returns Cleanup function to close the connection
   */
  loadDayDeferredStream(
    sessionId: string,
    dayNumber: number,
    onEvent: (event: { type: string; data: any }) => void,
    onComplete?: (result: { deferredContent: any; tokensUsed: number; fromCache: boolean }) => void,
    onError?: (error: string) => void
  ): () => void {
    const token = localStorage.getItem('auth_token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
    const url = `${baseUrl}/sessions/${sessionId}/days/${dayNumber}/load-deferred-stream`;

    const controller = new AbortController();

    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));
                const eventType = eventData.event || eventData.type;
                const data = eventData.data;

                onEvent({ type: eventType, data });

                if (eventType === 'complete' && onComplete) {
                  onComplete(data);
                }

                if (eventType === 'error' && onError) {
                  onError(data?.error || 'Unknown streaming error');
                }
              } catch (e) {
                console.warn('[SSE Deferred] Failed to parse event:', line, e);
              }
            }
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('[SSE Deferred] Stream error:', error);
          if (onError) {
            onError(error.message || 'Stream connection failed');
          }
        }
      });

    return () => {
      controller.abort();
    };
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

  /**
   * Save reflection data including confused concepts
   */
  async saveReflection(
    sessionId: string,
    dayNumber: number,
    reflectionData: {
      confidence: number;
      whatClicked?: string;
      whatsFoggy?: string;
      confusedConcepts?: string[];
      lockInSentence?: string;
      warmupPlan?: string;
      boostCompleted?: boolean;
      boostConcept?: string;
    }
  ): Promise<{ message: string; saved: boolean }> {
    const { data } = await api.post(
      `/sessions/${sessionId}/days/${dayNumber}/reflection`,
      reflectionData
    );
    return data;
  },

  /**
   * Generate a concept boost for a confused student
   * Returns a quick remediation with a different explanation angle
   */
  async generateConceptBoost(
    sessionId: string,
    dayNumber: number,
    concept: string,
    originalExplanation: string
  ): Promise<{
    message: string;
    boost: {
      concept: string;
      explanation: string;
      analogy?: string;
      codeExample?: string;
      quickCheck: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      };
    };
    tokensUsed: number;
  }> {
    const { data } = await api.post(
      `/sessions/${sessionId}/days/${dayNumber}/concept-boost`,
      { concept, originalExplanation }
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
  /**
   * Get transcript summary for a YouTube video (PRO feature)
   */
  async getTranscriptSummary(params: {
    videoId: string;
    concept?: string;
  }): Promise<{
    message: string;
    summary: string;
    keyPoints: string[];
  }> {
    const { data } = await api.post('/curriculum/transcript-summary', params);
    return data;
  },

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
