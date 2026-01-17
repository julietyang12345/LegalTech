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
  FREE = 'FREE',
  PRO = 'PRO',
  PREMIUM = 'PREMIUM',
  UNLIMITED = 'UNLIMITED',
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
  // Settings & Learner Preferences
  preferences?: {
    notifications?: boolean;
    dailyReminders?: boolean;
    weeklyDigest?: boolean;
    learner?: LearnerPrefs;
  };
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
  isProjectBased?: boolean;
  outputType?: 'working_code' | 'understand_concept' | 'fix_bug' | 'ship_project';
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

// Adaptive modality - video vs AI decision
export type ContentMode = 'video' | 'ai' | 'both';

export interface AdaptiveModalityInfo {
  defaultMode: ContentMode;
  videoConfidence: number;      // 0-100
  reason: string;               // Full explanation
  reasonShort: string;          // UI-friendly short version
}

// Backup video info when AI is default mode
export interface BackupVideo {
  videoId: string;
  title: string;
  channelName?: string;
  url: string;
  matchPercent?: number;
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

  // Adaptive modality fields (video vs AI)
  useAiExplanation?: boolean;   // True when AI is default mode
  concept?: string;             // The concept being explained
  explanation?: string;         // AI-generated explanation (markdown)
  reason?: string;              // Why this mode was chosen
  videoAvailable?: boolean;     // Is video available as backup?
  showVideoOption?: boolean;    // Should show "try video" button?
  showAiOption?: boolean;       // Should show "prefer AI" button?
  backupVideo?: BackupVideo;    // Video info when AI is default
  aiExplanation?: string;       // Pre-generated AI explanation when video is default
  adaptiveModality?: AdaptiveModalityInfo;

  // Content type classification
  contentType?: VideoContentType;  // CONCEPT, TOOL_SPECIFIC, or MIXED
}

export interface VideoContentType {
  type: 'CONCEPT' | 'TOOL_SPECIFIC' | 'MIXED';
  toolsMentioned?: string[];       // e.g., ['Zapier', 'Make']
  reason?: string;                 // Why this classification
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
  contentType?: VideoContentType;  // CONCEPT, TOOL_SPECIFIC, or MIXED
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

  // Split loading: backend saves content in these nested objects, merged on load
  coreContent?: Record<string, unknown>;      // video, foundationCards, task1, prePrompt
  deferredContent?: Record<string, unknown>;  // task2, practiceProject, reflection, skipTest
  coreLoaded?: boolean;
  deferredLoaded?: boolean;

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

  // Task section: Quiz or Fill-in-the-Blank for concept reinforcement
  // (Coding practice moved to bossMilestone micro-steps)
  task1?: QuizTask | FillBlankTask;
  taskFormat?: 'quiz' | 'fillBlank';
  practiceProject?: PracticeProject;

  reflection?: {
    questions: ReflectionQuestion[];
  };

  bossMilestone?: BossMilestone;

  // Boss project flag (from curriculum skeleton - indicates this day contributes to boss project)
  hasBossProject?: boolean;
  bossMilestonePreview?: string;
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

// ============================================
// Alternative Task Formats (Quiz & Fill-in-the-Blank)
// ============================================

// Task formats for concept reinforcement (code tasks moved to bossMilestone)
export type TaskFormat = 'quiz' | 'fillBlank';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];      // 4 options
  correctIndex: number;
  explanation: string;
}

export interface QuizTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  format: 'quiz';
  questions: QuizQuestion[];  // 5-8 questions
  passingScore: number;       // e.g., 0.7 = 70%
}

export interface FillBlankItem {
  id: string;
  codeTemplate: string;       // Code with ___BLANK___ markers
  blanks: {
    id: string;
    correctAnswers: string[]; // Multiple accepted answers
    hint?: string;
  }[];
  explanation: string;
}

export interface FillBlankTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  format: 'fillBlank';
  items: FillBlankItem[];     // 5-8 items
  passingScore: number;
}

// Union type for all task formats
export type TaskContent = Task | QuizTask | FillBlankTask;

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

// Boss micro-step for daily coding contribution (enhanced BossMilestone)
export interface BossMilestone {
  day: number;                    // Which day this micro-step is for
  title: string;                  // "Set up project structure"
  description: string;            // Overview of what we're building today
  microTask: string;              // Specific task description
  dayContribution: string;        // How this helps the final project
  conceptConnection: string;      // Links to today's concept from quiz/cards
  estimatedMinutes: number;       // 10-15 minutes

  // Code content
  starterCode: string;            // Code to start with (cumulative from previous days)
  expectedOutput?: string;        // What the result should look like
  hints?: Array<{ level: number; hint: string } | string>;
  solution?: string;              // Full solution for this micro-step
  solutionAnnotations?: string[]; // Explanation of the solution

  // Validation
  validationType: 'run' | 'visual' | 'test';  // How user validates their work
  validationInstructions?: string;             // "Run the code and check console"
}

export interface BossProject {
  day: number;                    // Final boss day number
  title: string;                  // "Interactive Todo App"
  description: string;            // Overall project description
  estimatedMinutes: number;
  combinesDays: number[];         // Days that contribute to this project

  // Micro-steps: one per day in combinesDays (indexed by day number)
  microSteps: Record<number, BossMilestone>;

  // Requirements for final project (AI generates {requirement, fromDay, concept})
  requirements: Array<string | { requirement: string; fromDay?: number; concept?: string }>;

  // Hints for final project (AI generates {level, hint, phase})
  hints?: Array<string | { level?: number; hint: string; phase?: string }>;

  // Step-by-step phases for boss day
  phases?: Array<{
    phase: number;
    title: string;
    minutes: number;
    objectives: string[];
    deliverable: string;
  }>;

  // Final project starter code (combined from all micro-steps)
  starterCode?: string;

  // npm dependencies for complex projects (React, Node, etc.)
  dependencies?: Record<string, string>;

  // Files for the complete project
  files?: {
    starter: string;
    hints: string;
    solution: string;
  };

  // Legacy fields (kept for backward compatibility)
  free?: {
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
  taskType: 'task1' | 'practice' | 'boss' | 'bossMicroStep' | 'reflection' | 'quiz' | 'fillBlank';
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

// Split loading responses (Core + Deferred)
export interface DayCoreContent {
  prePrompt: {
    text: string;
    primeQuestions: string[];
  };
  video: VideoMatch;
  foundationCards: FoundationCard[];
  task1: QuizTask | FillBlankTask;  // Quiz or fill-blank for concept reinforcement
  bossMilestone?: BossMilestone;    // Daily micro-step for boss project coding
  skipTest: SkipTest;
}

export interface DayDeferredContent {
  task2?: Task;
  practiceProject: PracticeProject;
  reflection: {
    questions: ReflectionQuestion[];
  };
}

export interface StartDayCoreResponse {
  message: string;
  coreContent: DayCoreContent;
  tokensUsed: number;
  fromCache: boolean;
  bossProject?: BossProject;  // Updated boss project data if micro-step was generated
  variantId?: string;         // Variant ID for quality tracking
  regenCount?: number;        // Current regeneration count for this day
  regenLimit?: number;        // Maximum allowed regenerations per day
}

export interface LoadDayDeferredResponse {
  message: string;
  deferredContent: DayDeferredContent;
  tokensUsed: number;
  fromCache: boolean;
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
// Concept Boost Types (Quick remediation)
// ============================================

export interface ConceptBoost {
  concept: string;
  explanation: string;      // 2-3 sentences, different angle than foundation card
  analogy?: string;         // Real-world analogy to make it click
  codeExample?: string;     // Optional small code example
  quickCheck: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

export interface ConceptBoostResponse {
  message: string;
  boost: ConceptBoost;
  tokensUsed: number;
}

export interface ReflectionData {
  confidence: number;
  whatClicked?: string;
  whatClickedDetails?: string;
  whatsFoggy?: string;
  foggyDetails?: string;
  lockInSentence?: string;
  warmupPlan?: string;
  confusedConcepts?: string[];  // Foundation card concepts user found confusing
  boostCompleted?: boolean;     // Whether user took the quick boost
  boostConcept?: string;        // Which concept they got boosted on
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

// ============================================
// Learner Preferences & Onboarding Types
// ============================================

// Language alternative for a direction
export interface LanguageAlternative {
  language: string;
  reason: string;
  tradeoffs?: string;
}

// Language configuration for code-based directions
export interface LanguageConfig {
  recommended: string;
  recommendedReason: string;
  alternatives?: LanguageAlternative[];
}

// Direction generated by AI during onboarding
export interface LearningDirection {
  id: string;
  title: string;                 // "Webhooks + APIs for automations"
  outcome: string;               // "You'll be able to build reliable integrations"
  keywords: string[];            // ["webhooks", "API", "requests", "auth"]
  isToolSpecific: boolean;       // false for concept, true for Zapier/Make
  estimatedMinutes: number;      // 60
  paymentNote?: string;          // "May require paid subscription" for paid tools
  isFree?: boolean;              // true for free tools, false for paid
  skillType?: SkillType;         // Detected skill type for this direction
  languageConfig?: LanguageConfig; // Language options for CODE/AI_AGENT directions
}

/**
 * Output types for different skill categories.
 * - Code skills (CODE, AI_AGENT, DESIGN): working_code, ship_project, fix_bug
 * - Knowledge skills (KNOWLEDGE): understand_concept, pass_exam, teach_others
 * - Physical skills (PHYSICAL): perform_skill, compete, master_basics
 */
export type OutputType =
  // Code/technical skills
  | 'working_code'
  | 'ship_project'
  | 'fix_bug'
  // Universal
  | 'understand_concept'
  | 'teach_others'
  // Knowledge skills (languages, academic, etc.)
  | 'pass_exam'
  | 'apply_practical'
  // Physical skills (sports, music, dance, etc.)
  | 'perform_skill'
  | 'compete'
  | 'master_basics';

// Refinement context (from Step 3b if user selects "Not quite")
export interface RefinementContext {
  outputType?: OutputType;
  usageContext?: 'work' | 'personal' | 'interview' | 'school';
  timeMinutes?: number;
  platformTolerance?: 'any' | 'preferGeneric' | 'genericOnly';
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  userFeedback?: string; // Free-text: "I want X instead of Y"
  previousDirections?: string; // JSON string of previous directions (to avoid regenerating)
}

// Full learner preferences (stored in User.preferences.learner)
export interface LearnerPrefs {
  // From onboarding Step 1
  originalGoal: string;              // User's free-text goal (kept for reference)

  // From onboarding Step 4
  selectedDirection: string;         // The direction title they picked
  selectedDirectionOutcome: string;  // "You'll be able to..." - specific deliverable
  directionKeywords: string[];       // Keywords for video matching hints

  // From onboarding Step 4b: Language selection
  selectedLanguage?: string;         // User's chosen language (or recommended default)

  // From refinement (Step 3b, if used)
  outputType?: OutputType;
  usageContext?: 'work' | 'personal' | 'interview' | 'school';

  // From depth test (Step 5)
  contentDepth: 'fast' | 'medium' | 'deep';

  // Platform tolerance (from direction label or refinement)
  platformTolerance: 'any' | 'preferGeneric' | 'genericOnly';

  // Constraints (from refinement, optional)
  dailyMinutes?: number;             // 15, 30, 60, 90
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';

  // Metadata
  completedOnboarding: boolean;
  onboardingCompletedAt?: string;
  version: number;
}

// Response from AI direction generation
export interface DirectionsResponse {
  directions: LearningDirection[];
  interpretedGoal: string;
}

// DTO for completing onboarding
export interface CompleteOnboardingDto {
  originalGoal: string;
  selectedDirection: string;
  selectedDirectionOutcome: string; // "You'll be able to..." from the direction
  directionKeywords: string[];
  contentDepth: 'fast' | 'medium' | 'deep';
  platformTolerance?: 'any' | 'preferGeneric' | 'genericOnly';
  selectedLanguage?: string; // User's chosen language (for CODE/AI_AGENT)
  outputType?: OutputType;
  usageContext?: 'work' | 'personal' | 'interview' | 'school';
  dailyMinutes?: number;
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
}
