// ============================================
// Enums (matching backend)
// ============================================

export enum SkillLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum SessionMode {
  NORMAL = 'NORMAL',
  SPRINT = 'SPRINT',
  EXTENDED = 'EXTENDED',
}

export enum DayStatus {
  LOCKED = 'locked',
  UNLOCKABLE = 'unlockable',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export enum QuotaTier {
  FREE = 'free',
  PRO = 'pro',
  PREMIUM = 'premium',
}

export enum SkillType {
  CODE = 'CODE',
  PHYSICAL = 'PHYSICAL',
  KNOWLEDGE = 'KNOWLEDGE',
  DESIGN = 'DESIGN',
  AI_AGENT = 'AI_AGENT',
}

export enum SkillComplexity {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  quotaTier: QuotaTier;
  currentStreak: number;
  longestStreak: number;
  totalSessionsCompleted: number;
  monthlyTokensUsed: number;
  monthlyCurriculaGenerated: number;
  quotaResetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ============================================
// Session Types
// ============================================

export interface Session {
  id: string;
  userId: string;
  skillName: string;
  durationDays: number;
  hoursPerDay: number;
  skillLevel: SkillLevel;
  curriculum: Curriculum;
  status: SessionStatus;
  mode: SessionMode;
  currentDay: number;
  startedAt: string;
  completedAt?: string;
  originalDuration?: number;
  // Cache tracking
  variantId?: string;
  fromCache?: boolean;
  progress: Progress[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionDto {
  skillName: string;
  durationDays: number;
  hoursPerDay: number;
  skillLevel: SkillLevel;
  previewCurriculum?: any; // Preview curriculum to reuse (avoids regeneration)
}

export interface UpdateSessionDto {
  status?: SessionStatus;
  mode?: SessionMode;
  currentDay?: number;
}

// ============================================
// Curriculum Types
// ============================================

export interface CurriculumMetadata {
  skillName: string;
  durationDays: number;
  hoursPerDay: number;
  skillLevel: SkillLevel;
  skillType: SkillType;
  complexity: SkillComplexity;
  suggestedLanguage?: string;
}

export interface Curriculum {
  finalProjectTitle: string;
  finalProjectDescription: string;
  skillType: SkillType;
  days: CurriculumDay[];
  bossProjects: BossProject[];
  prerequisites: string[];
  recommendedTools: string[];
  metadata?: CurriculumMetadata;
}

// Skip test for testing out of a day (multiple choice)
export interface SkipTestQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface SkipTest {
  questionSets: SkipTestQuestion[][];
  currentSetIndex: number;
  passThreshold: number;
}

// Day skeleton (Phase 1 - overview only)
export interface DaySkeleton {
  videoTitle: string;
  videoDescription: string;
  task1Preview: string;
  practicePreview: string;
  estimatedMinutes: number;
}

// Video matching types (from backend VideoMatchResult)
export interface VideoMatch {
  title: string;
  url?: string;
  videoId?: string;
  channelName?: string;
  thumbnailUrl?: string;
  duration?: number;          // seconds
  startTime?: string;
  endTime?: string;
  watchInstructions?: string;
  keyTopics?: string[];
  summary?: string;           // AI-generated 3-sentence summary for Active Recall
  estimatedMinutes: number;
  verified?: boolean;
  matchPercent?: number;      // 0-100 confidence
  whyThisVideo?: string[];    // Reasons for selection
  alternative?: VideoAlternative;    // Legacy: single alternative
  alternatives?: VideoAlternative[]; // Up to 2 pre-screened alternatives
  // Fallback fields when video search fails (from AI placeholder)
  searchQuery?: string;
  preferredChannels?: string[];
  topicFocus?: string;
  watchPoints?: string[];
}

export interface VideoAlternative {
  title: string;
  url?: string;
  videoId: string;
  channelName?: string;
  thumbnailUrl?: string;
  duration?: number;
  startTime?: string;
  endTime?: string;
  watchInstructions?: string;
  estimatedMinutes?: number;
  differentiator: string;     // e.g., "⚡ Shorter", "🎨 Different style"
  matchPercent: number;
}

export interface CurriculumDay {
  day: number;
  title: string;
  objectives: string[];
  estimatedMinutes: number;
  adaptationNote?: string;

  // Two-phase architecture fields
  status: DayStatus;
  detailsLoaded: boolean;
  skeleton?: DaySkeleton;
  skipTest?: SkipTest;

  // Nested content object (backend saves day content here, merged on load)
  content?: Record<string, unknown>;

  // Full content (loaded in Phase 2)
  prePrompt?: {
    text: string;
    primeQuestions: string[];
  };

  video?: VideoMatch;

  // Foundation cards (new Imprint-style flow - replaces activeRecall + conceptCheck)
  foundationCards?: FoundationCard[];

  // Legacy fields (kept for backward compatibility)
  activeRecall?: {
    part1: {
      instruction: string;
      keyPointsToInclude: string[];
    };
    part2: {
      skipOnDay1: boolean;
      yesterdayQuestion: string;
      yesterdayAnswer: string;
      connectionQuestion: string;
      exampleConnection: string;
    };
  };

  conceptCheck?: {
    questions: ConceptQuestion[];
  };

  task1?: Task;
  practiceProject?: PracticeProject;

  reflection?: {
    questions: ReflectionQuestion[];
  };

  bossMilestone?: BossMilestone;
}

export interface ConceptQuestion {
  level: 1 | 2 | 3;
  question: string;
  options: string[];      // 4 multiple choice options
  correctIndex: number;   // Index of correct answer (0-3)
  explanation: string;    // Why correct answer is right
}

// ============================================
// Foundation Cards Types (Imprint-style chunked learning)
// ============================================

export interface MicroQuestion {
  question: string;
  type: 'understanding' | 'gotit';  // MCQ or simple yes/confused
  options?: string[];               // For 'understanding' type (2-4 options)
  correctIndex?: number;            // For 'understanding' type
  explanation?: string;             // Shown after answering
}

export interface FoundationCard {
  id: string;
  concept: string;           // One-line title (max 60 chars)
  visual?: string;           // Emoji hint
  explanation: string;       // 2-3 sentences
  realWorldContext?: string; // Why this matters in real work (1 sentence)
  videoTimestampRef?: string; // Reference to video moment (e.g., "Remember at 2:15...")
  codeExample?: string;      // Optional code snippet (max 5 lines)
  microQuestion: MicroQuestion;
  order: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;

  // New flat structure from backend
  challenge?: string;
  expectedOutput?: string;
  starterCode?: string;
  hints?: Array<{ level: number; hint: string } | string>;
  solution?: string;
  solutionAnnotations?: string[];

  // Legacy nested structure (kept for backward compatibility)
  free?: {
    challengeDescription: string;
    expectedOutput: string;
    hint1: string;
    solution: string;
    solutionAnnotations: string[];
  };
  pro?: {
    starterCode: string;
    hints: string[];
    aiTutorAccess: boolean;
  };

  stuckDetection?: {
    triggerAfterMinutes: number;
    suggestions: string[];
  };
  files?: {
    starter: string;
    hints: string;
    solution: string;
  };
}

export interface PracticeProject {
  id: string;
  title: string;
  estimatedMinutes: number;
  coreChallenge: string;
  stretchGoals: StretchGoal[];
  tierResources: {
    free: { hint1: boolean; solution: boolean };
    pro: { stepByStep: boolean; hints: number; aiTutor: boolean };
    premium: {
      adaptiveDifficulty: {
        high: string;
        medium: string;
        low: string;
      };
    };
  };
  files?: {
    starter: string;
    hints: string;
    solution: string;
  };
}

export interface StretchGoal {
  condition: string;
  goal: string;
  tier?: string;
}

export interface BossMilestone {
  description: string;
  microTask: string;
  dayContribution: string;
}

export interface BossProject {
  day: number;
  title: string;
  estimatedMinutes: number;
  combinesDays: number[];
  free: {
    projectDescription: string;
    requirements: string[];
    hint1: string;
    solution: string;
  };
  pro?: {
    allDaysStepByStep: boolean;
    hints: string[];
    weaknessStrengthSummary: boolean;
  };
  premium?: {
    adaptiveDifficulty: {
      challenge: string;
      standard: string;
      guided: string;
    };
  };
  files?: {
    starter: string;
    hints: string;
    solution: string;
  };
}

export interface ReflectionQuestion {
  id: number;
  question: string;
}

// ============================================
// Progress Types
// ============================================

export interface Progress {
  id: string;
  sessionId: string;
  taskId: string;
  dayNumber: number;
  taskType: 'task1' | 'practice' | 'boss' | 'reflection';
  completed: boolean;
  completedAt?: string;
  confidenceScore?: number;
  timeSpentMinutes?: number;
  attempts: number;
  notes?: string;
  submittedCode?: string;
  lastAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProgressDto {
  completed?: boolean;
  confidenceScore?: number;
  timeSpentMinutes?: number;
  notes?: string;
  submittedCode?: string;
  topic?: string;
}

export interface ProgressStats {
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
  averageConfidence: number;
  totalTimeSpent: number;
  progressByDay: DayProgress[];
}

export interface DayProgress {
  day: number;
  totalTasks: number;
  completedTasks: number;
  averageConfidence: number;
}

// ============================================
// Project Types
// ============================================

export interface Project {
  id: string;
  userId: string;
  sessionId?: string;
  title: string;
  description?: string;
  demoUrl?: string;
  githubUrl?: string;
  screenshotUrl?: string;
  skillsTags: string[];
  isBossProject: boolean;
  likes: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  title: string;
  description?: string;
  sessionId?: string;
  demoUrl?: string;
  githubUrl?: string;
  screenshotUrl?: string;
  skillsTags?: string[];
}

// ============================================
// Companion Types
// ============================================

export interface CompanionContext {
  userName?: string;
  currentStreak?: number;
  currentTopic?: string;
  currentProgress?: number;
  recentStruggle?: boolean;
  consecutiveFailures?: number;
  hourOfDay?: number;
  dayOfWeek?: number;
  sessionDayNumber?: number;
  totalDays?: number;
}

export interface CompanionMessage {
  id: string;
  content: string;
  mood: 'welcoming' | 'encouraging' | 'celebratory' | 'supportive' | 'focused';
  timestamp: string;
  isUser: boolean;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  message?: string;
  data?: T;
  error?: string;
}

export interface SessionResponse {
  message: string;
  session: Session;
  warnings?: string[];
  skillDetection?: {
    skillType: SkillType;
    complexity: SkillComplexity;
    estimatedDaysNeeded: number;
    cognitiveLoadWarning?: string;
  };
  // Cache info
  fromCache?: boolean;
  variantId?: string;
}

export interface ProgressResponse {
  message: string;
  progress: Progress;
  companionMessage?: {
    content: string;
    mood: string;
  };
}

// Two-phase curriculum responses
export interface StartDayResponse {
  message: string;
  dayContent: CurriculumDay;
  tokensUsed: number;
}

export interface SkipTestResponse {
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  passThreshold: number;
  message: string;
  nextDayUnlocked: boolean;
  newQuestions?: { question: string; options: string[]; correctIndex: number }[];
  suggestion?: string;
  allSetsExhausted?: boolean;
}

export interface PracticeSubmitResponse {
  message: string;
  nextDayUnlocked: boolean;
  feedback?: string;
}

export interface DayDetailsResponse {
  day: CurriculumDay;
  status: DayStatus;
  detailsLoaded: boolean;
  content?: CurriculumDay;
}

// ============================================
// Focus Mode Types
// ============================================

export type SessionStep =
  | 'prePrompt'
  | 'video'
  | 'foundationCards'  // New Imprint-style flow
  | 'activeRecall'     // Legacy
  | 'memoryBridge'     // Legacy
  | 'conceptCheck'     // Legacy
  | 'task1'
  | 'bossMilestone'
  | 'reflection';

export interface StepState {
  currentStep: SessionStep;
  completedSteps: SessionStep[];
  stepStartTime?: Date;
}

// ============================================
// Life Happens Types
// ============================================

export type LifeHappensMode = 'sprint' | 'extend' | 'pause';

export interface LifeHappensConfig {
  mode: LifeHappensMode;
  originalDays: number;
  newDays: number;
  backlogTasks: string[];
}
