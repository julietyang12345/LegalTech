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

export enum GoalType {
  CURRICULUM = 'curriculum',
  INTERVIEW = 'interview',
  PROJECT = 'project',
  AI_BUILDER = 'ai_builder',
  LANGUAGE = 'language',
}

// ============================================
// User Types
// ============================================

export enum UserRole {
  MEMBER = 'MEMBER',
  ADMIN = 'ADMIN',
}

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  quotaTier: QuotaTier;
  role?: UserRole;
  hasPassword?: boolean;
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
    theme?: 'light' | 'dark';
    learner?: LearnerPrefs;
  };
}

/**
 * Get effective tier - admins always get UNLIMITED tier benefits
 */
export function getEffectiveTier(user: User): QuotaTier {
  if (user.role === UserRole.ADMIN) {
    return QuotaTier.UNLIMITED;
  }
  return user.quotaTier;
}

/**
 * Get daily limits based on effective tier
 */
export function getDailyLimits(user: User): {
  dayContentRegens: number;
  curriculumRegens: number;
  aiTutorConversations: number;
} {
  const effectiveTier = getEffectiveTier(user);

  switch (effectiveTier) {
    case QuotaTier.FREE:
      return {
        dayContentRegens: 2,
        curriculumRegens: 2,
        aiTutorConversations: 5,
      };
    case QuotaTier.PRO:
      return {
        dayContentRegens: 10,
        curriculumRegens: 10,
        aiTutorConversations: Infinity,
      };
    case QuotaTier.PREMIUM:
    case QuotaTier.UNLIMITED:
      return {
        dayContentRegens: Infinity,
        curriculumRegens: Infinity,
        aiTutorConversations: Infinity,
      };
    default:
      return {
        dayContentRegens: 2,
        curriculumRegens: 2,
        aiTutorConversations: 5,
      };
  }
}

export interface AuthState {
  user: User | null;
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
  goalType?: GoalType;
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
  // User-specified focus areas for content emphasis
  improvementAreas?: string[];
  // User-specified areas to reduce content for
  lessOfAreas?: string[];
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
  goalType?: GoalType;
  skillDetection?: any; // Pre-computed from estimate-days (avoids duplicate AI call)
}

export interface UpdateSessionDto {
  status?: SessionStatus;
  mode?: SessionMode;
  currentDay?: number;
  improvementAreas?: string[];
  lessOfAreas?: string[];
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

  // Language learning specific (when skillType is KNOWLEDGE + language skill)
  isLanguageLearning?: boolean;
  targetLanguage?: TargetLanguage;
  proficiencyLevel?: string;       // HSK1, A1, N5, etc.
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
  keyLearningPoints?: string[];  // AI-generated key points when video is skipped

  // Adaptive modality fields (video vs AI)
  concept?: string;             // The concept being explained
  explanation?: string;         // AI-generated explanation (markdown)
  reason?: string;              // Why this mode was chosen
  videoAvailable?: boolean;     // Is video available as backup?
  showVideoOption?: boolean;    // Should show "try video" button?
  showAiOption?: boolean;       // Should show "prefer AI" button?
  backupVideo?: BackupVideo;    // Video info when AI is default
  aiExplanation?: string;       // Pre-generated AI explanation when video is default
  aiConceptBreakdown?: Array<{ concept: string; explanation: string }>; // Haiku-generated concept breakdown
  adaptiveModality?: AdaptiveModalityInfo;

  // Content type classification
  contentType?: VideoContentType;  // CONCEPT, TOOL_SPECIFIC, or MIXED

  // Skip video step entirely - foundation cards are the learning content
  skipped?: boolean;
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
  coreContent?: Record<string, unknown>;      // video, foundationCards, prePrompt (task1 moved to deferredContent)
  deferredContent?: {
    reflection?: { questions: ReflectionQuestion[] };
    intensivePractice?: IntensivePractice;  // For practice-based learning
  };
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

  // Task section: Quiz, Fill-in-the-Blank, Mixed, or Sections for concept reinforcement
  // (Coding practice moved to bossMilestone micro-steps)
  task1?: QuizTask | MixedTask | SectionsTask;
  taskFormat?: TaskFormat;

  reflection?: {
    questions: ReflectionQuestion[];
  };

  bossMilestone?: BossMilestone;

  // Boss project flag (from curriculum skeleton - indicates this day contributes to boss project)
  hasBossProject?: boolean;
  bossMilestonePreview?: string;

  // Language learning specific (when isLanguageLearning = true)
  dailyDeck?: DailyDeck;                      // Auto-generated vocab deck for the day
  languageFoundationCards?: LanguageFoundationCard[]; // Language-specific cards

  // Intensive practice (for practice-based learning, spread from deferredContent by sessionStore)
  intensivePractice?: IntensivePractice;

  // Open task (real-world practice challenge, spread from deferredContent by sessionStore)
  openTask?: OpenTask;
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

// Case study embedded in foundation card (for decision-making concepts)
export interface CaseStudyOption {
  label: string;              // Short answer (1-5 words)
  consequence: string;        // "This works, but..." or "This fails because..."
}

export interface EmbeddedCaseStudy {
  scenario: string;           // "You're building X and encounter Y..." (2-3 sentences)
  question: string;           // "What would you do?"
  options: (string | CaseStudyOption)[]; // 3-4 choices (can be strings or objects)
  bestChoice: number;         // Index of best option (0-based)
  explanation: string;        // Why this is best approach
}

export interface FoundationCard {
  id: string;
  concept: string;           // One-line title (max 60 chars)
  visual?: string;           // Emoji hint
  explanation: string;       // 2-3 sentences
  realWorldContext?: string; // Why this matters in real work (1 sentence)
  videoTimestampRef?: string; // Reference to video moment (e.g., "Remember at 2:15...")
  codeExample?: string;      // Optional code snippet (max 5 lines)
  caseStudy?: EmbeddedCaseStudy;  // Optional case study for decision-making concepts
  microQuestion: MicroQuestion;
  order: number;
}

// ============================================
// Language Learning Types (Generic Framework)
// ============================================

// Supported target languages with their features
export type TargetLanguage =
  | 'chinese'    // Mandarin - tones, characters, pinyin
  | 'japanese'   // Hiragana, katakana, kanji, romaji
  | 'korean'     // Hangul, romanization
  | 'arabic'     // RTL, script, diacritics
  | 'spanish'    // Gender, conjugation
  | 'french'     // Gender, liaisons, accents
  | 'german'     // Cases, gender, compound words
  | 'italian'    // Gender, conjugation
  | 'portuguese' // Gender, nasal sounds
  | 'russian'    // Cyrillic, cases, aspect
  | 'hindi'      // Devanagari, gender
  | 'thai'       // Tones, no spaces, script
  | 'vietnamese' // Tones, diacritics
  | 'other';

// Language-specific features (auto-enabled based on target language)
export interface LanguageFeatures {
  hasTones: boolean;              // Chinese, Thai, Vietnamese
  hasGender: boolean;             // Spanish, French, German, etc.
  hasScript: boolean;             // Non-Latin scripts (Chinese, Japanese, Arabic, etc.)
  hasRomanization: boolean;       // Pinyin, Romaji, etc.
  isRTL: boolean;                 // Arabic, Hebrew
  hasStrokeOrder: boolean;        // Chinese, Japanese kanji
  hasCases: boolean;              // German, Russian
  hasConjugation: boolean;        // Most European languages
  proficiencyLevels?: string[];   // HSK, JLPT, CEFR, etc.
}

// Default features per language
export const LANGUAGE_FEATURES: Record<TargetLanguage, LanguageFeatures> = {
  chinese: { hasTones: true, hasGender: false, hasScript: true, hasRomanization: true, isRTL: false, hasStrokeOrder: true, hasCases: false, hasConjugation: false, proficiencyLevels: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'] },
  japanese: { hasTones: false, hasGender: false, hasScript: true, hasRomanization: true, isRTL: false, hasStrokeOrder: true, hasCases: false, hasConjugation: true, proficiencyLevels: ['N5', 'N4', 'N3', 'N2', 'N1'] },
  korean: { hasTones: false, hasGender: false, hasScript: true, hasRomanization: true, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: true, proficiencyLevels: ['TOPIK1', 'TOPIK2', 'TOPIK3', 'TOPIK4', 'TOPIK5', 'TOPIK6'] },
  arabic: { hasTones: false, hasGender: true, hasScript: true, hasRomanization: true, isRTL: true, hasStrokeOrder: false, hasCases: true, hasConjugation: true },
  spanish: { hasTones: false, hasGender: true, hasScript: false, hasRomanization: false, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: true, proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  french: { hasTones: false, hasGender: true, hasScript: false, hasRomanization: false, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: true, proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  german: { hasTones: false, hasGender: true, hasScript: false, hasRomanization: false, isRTL: false, hasStrokeOrder: false, hasCases: true, hasConjugation: true, proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  italian: { hasTones: false, hasGender: true, hasScript: false, hasRomanization: false, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: true, proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  portuguese: { hasTones: false, hasGender: true, hasScript: false, hasRomanization: false, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: true, proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  russian: { hasTones: false, hasGender: true, hasScript: true, hasRomanization: true, isRTL: false, hasStrokeOrder: false, hasCases: true, hasConjugation: true, proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  hindi: { hasTones: false, hasGender: true, hasScript: true, hasRomanization: true, isRTL: false, hasStrokeOrder: false, hasCases: true, hasConjugation: true },
  thai: { hasTones: true, hasGender: false, hasScript: true, hasRomanization: true, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: false },
  vietnamese: { hasTones: true, hasGender: false, hasScript: false, hasRomanization: false, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: false },
  other: { hasTones: false, hasGender: false, hasScript: false, hasRomanization: false, isRTL: false, hasStrokeOrder: false, hasCases: false, hasConjugation: false },
};

// Vocabulary item - the core learning unit
export interface VocabularyItem {
  id: string;

  // Core content (required)
  term: string;                   // The word in target language
  definition: string;             // Meaning in user's language

  // Pronunciation (use browser TTS by default)
  romanization?: string;          // Pinyin, romaji, transliteration
  romanizationAlt?: string;       // Alternative notation (e.g., "xue2" vs "xué")
  pronunciation?: string;         // IPA or simplified pronunciation guide
  audioUrl?: string;              // Optional pre-recorded audio (cloud TTS)

  // Language-specific fields (populated based on LanguageFeatures)
  tone?: number | number[];       // For tonal languages (1-5 or array for multi-syllable)
  gender?: 'masculine' | 'feminine' | 'neuter'; // For gendered languages
  scriptVariants?: {              // For languages with multiple scripts
    primary: string;              // e.g., simplified Chinese, hiragana
    secondary?: string;           // e.g., traditional Chinese, kanji
    tertiary?: string;            // e.g., katakana for Japanese
  };

  // Context & examples
  partOfSpeech?: string;          // noun, verb, adjective, etc.
  examples: ExampleSentence[];    // 1-3 example sentences

  // Metadata
  proficiencyLevel?: string;      // HSK1, N5, A1, etc.
  frequency?: number;             // 1-10000 (lower = more common)
  tags?: string[];                // Categories: food, travel, business, etc.

  // Related words (for later phases)
  relatedWords?: string[];        // IDs of related vocabulary
}

// Example sentence with audio
export interface ExampleSentence {
  sentence: string;               // Full sentence in target language
  romanization?: string;          // Romanized version
  translation: string;            // Translation
  audioUrl?: string;              // Optional audio
}

// Daily deck - the habit loop core
export interface DailyDeck {
  date: string;                   // ISO date
  sessionId: string;

  // Auto-generated deck (no user choice = less friction)
  newWords: VocabularyItem[];     // 5 new words
  reviewWords: VocabularyItem[];  // 5 review words (from spaced repetition)

  // Quick listening check (1-2 questions)
  listeningCheck?: ListeningQuestion[];

  // Progress
  completed: boolean;
  completedAt?: Date;
  streakDay?: number;             // Current streak count
}

// Listening question - audio → choice
export interface ListeningQuestion {
  id: string;
  audioText: string;              // Text to be spoken (use browser TTS)
  audioUrl?: string;              // Optional pre-recorded
  questionType: 'meaning' | 'transcription' | 'fill-blank';

  // For 'meaning' type
  options?: string[];             // Multiple choice options
  correctIndex?: number;

  // For 'transcription' type
  correctAnswer?: string;
  acceptedVariants?: string[];    // Alternative correct answers

  // For 'fill-blank' type
  sentenceWithBlank?: string;     // "I ___ to the store"
  blankAnswer?: string;
}

// Spaced repetition progress (SM-2 algorithm)
export interface VocabProgress {
  id: string;
  userId: string;
  vocabularyId: string;
  sessionId: string;

  // SM-2 algorithm fields
  easeFactor: number;             // Default 2.5, adjusted per review
  interval: number;               // Days until next review
  repetitions: number;            // Successful reviews in a row
  nextReviewDate: Date;

  // Stats
  totalReviews: number;
  correctCount: number;
  lastReviewedAt?: Date;

  // Mastery level (derived from easeFactor + repetitions)
  masteryLevel: 'new' | 'learning' | 'reviewing' | 'mastered';
}

// Language learning session config
export interface LanguageLearningConfig {
  targetLanguage: TargetLanguage;
  proficiencyLevel?: string;      // HSK1, A1, N5, etc.
  features: LanguageFeatures;     // Auto-populated from LANGUAGE_FEATURES

  // User preferences
  showRomanization: boolean;      // Show pinyin/romaji by default
  showScriptVariant?: 'primary' | 'secondary' | 'both'; // Simplified/traditional
  dailyNewWords: number;          // Default 5
  dailyReviewWords: number;       // Default 5

  // TTS preference
  useBrowserTTS: boolean;         // Default true (free, instant)
  ttsSpeed?: number;              // 0.75, 1.0, 1.25
}

// Grammar rule structure for grammar-focused language learning
export interface GrammarRule {
  rule: string;                   // The grammar rule in simple terms
  pattern: string;                // Pattern structure (e.g., "Subject + Verb + Object")
  patternInTarget?: string;       // Pattern shown in target language
  genderNotes?: string;           // How gender affects this pattern (for gendered languages)
  formality?: 'formal' | 'informal' | 'neutral';
  proficiencyLevel?: string;      // A1/A2/B1/etc
  examples: GrammarExample[];     // 1-3 example sentences with breakdown
  commonMistakes?: CommonMistake[];
}

export interface GrammarExample {
  sentence: string;               // Full sentence in target language
  breakdown?: string;             // Word-by-word breakdown
  translation: string;            // English translation
  notes?: string;                 // Why this example demonstrates the rule
  romanization?: string;          // Optional romanization
}

export interface CommonMistake {
  wrong: string;                  // Incorrect usage
  correct: string;                // Correct usage
  why: string;                    // Explanation
}

// Foundation card extended for language learning
export interface LanguageFoundationCard extends FoundationCard {
  // Language-specific content
  vocabulary?: VocabularyItem;    // If card teaches a word (vocabulary-focused)
  grammar?: GrammarRule;          // If card teaches a grammar rule (grammar-focused)

  // Legacy field (kept for backward compatibility)
  grammarPattern?: {
    pattern: string;              // e.g., "Subject + 了 + Verb"
    meaning: string;
    examples: ExampleSentence[];
  };

  // Audio (uses browser TTS if audioUrl not provided)
  audioText?: string;             // Text to speak
  audioUrl?: string;              // Pre-recorded audio
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
// 'sections' is the new unified format that works for ALL skill types
export type TaskFormat = 'quiz' | 'mixed' | 'sections';

// ============================================
// Language Learning Exercise Types
// ============================================

// New knowledge/vocabulary introduced in a section (shown before exercises)
export interface NewKnowledgeItem {
  term: string;           // The new word/concept
  meaning: string;        // Explanation or translation
  pronunciation?: string; // Optional pronunciation guide
  example?: string;       // Optional example usage
}

// Tone selection exercise - for tonal languages
export interface ToneSelectQuestion {
  id: string;
  audioText: string;        // Word to speak
  prompt: string;           // e.g., "Select the correct tone"
  options: string[];        // e.g., ["mā (1st)", "má (2nd)", "mǎ (3rd)", "mà (4th)"]
  correctIndex: number;
  explanation: string;
  // Concept-teaching fields
  conceptTitle?: string;
  realWorldContext?: string;
}

export interface ToneSelectSection {
  type: 'toneSelect';
  title: string;
  questions: ToneSelectQuestion[];
}

// Quiz section for mixed task
export interface QuizSection {
  type: 'quiz';
  title: string;
  questions: QuizQuestion[];
  newKnowledge?: NewKnowledgeItem[];
}

// Translation exercise
export interface TranslationItem {
  id: string;
  direction: 'toTarget' | 'toEnglish';
  prompt: string;               // Text to translate
  romanization?: string;        // For toEnglish direction
  acceptedAnswers: string[];    // Multiple correct translations
  hint?: string;
}

export interface TranslationSection {
  type: 'translation';
  title: string;
  instructions: string;
  items: TranslationItem[];
  newKnowledge?: NewKnowledgeItem[];  // New vocabulary shown before exercises
}

// Typing exercise
export interface TypingItem {
  id: string;
  prompt: string;           // Instruction
  displayText?: string;     // Text to show (for visual typing)
  audioText?: string;       // Text to speak (for audio typing)
  acceptedAnswers: string[];
  romanization?: string;
}

export interface TypingSection {
  type: 'typing';
  title: string;
  instructions: string;
  items: TypingItem[];
  newKnowledge?: NewKnowledgeItem[];
}

// Roleplay section (language training)
export interface RoleplaySection {
  type: 'roleplay';
  title: string;
  situation: string;
  yourRole: string;
  counterpartRole: string;
  targetPhrases: string[];
  sampleResponse: string;
  evaluationCriteria?: string[];
  turns?: string[];
  questions?: string[];
}

// Rewrite section (language training)
export interface RewriteSection {
  type: 'rewrite';
  title: string;
  context: string;
  weakVersion: string;
  targetImprovements: string[];
  sampleStrongVersion: string;
  evaluationCriteria?: string[];
}

// ============================================
// Code-Specific Sections (NEW)
// ============================================

export interface CodeCompletionItem {
  id: string;
  description: string;
  starterCode: string;
  solution: string;
  hints: string[];
  language?: string;
}

export interface CodeCompletionSection {
  type: 'codeCompletion';
  title: string;
  items: CodeCompletionItem[];
}

// AI Code Review - review AI-generated code for issues (combines review + debug)
export interface AICodeReviewIssue {
  id: string;
  type: 'bug' | 'security' | 'assumption' | 'scalability' | 'hallucination' | 'edge-case';
  location: string;              // "line 12" or "the auth check"
  severity: 'critical' | 'warning' | 'minor';
  options: string[];             // Multiple choice options for why this is an issue
  correctIndex: number;          // Index of the correct explanation
  explanation: string;           // Detailed explanation shown after answering
}

export interface AICodeReviewItem {
  id: string;
  code: string;                    // AI-generated code to review
  context: string;                 // "This API endpoint handles user auth..."
  promptUsed?: string;             // Optional: "Write a function that..."
  issues: AICodeReviewIssue[];     // Issues to find
  correctVersion?: string;         // Optional: fixed code (for learning)
  hint?: string;
  language?: string;
}

export interface AICodeReviewSection {
  type: 'aiCodeReview';
  title: string;
  instructions?: string;           // "Review this AI-generated code and identify issues"
  items: AICodeReviewItem[];
  passingScore: number;            // e.g., 0.7 = find 70% of issues
}

// Legacy debugging - kept for backwards compatibility
export interface DebuggingItem {
  id: string;
  buggyCode: string;
  fixedCode: string;
  hint?: string;
  explanation: string;
  language?: string;
}

export interface DebuggingSection {
  type: 'debugging';
  title: string;
  items: DebuggingItem[];
}

// ============================================
// Physical-Specific Sections (NEW)
// ============================================

export interface SafetyCheckItem {
  id: string;
  question: string;
  correctAnswer: boolean;
  explanation: string;
}

export interface SafetyCheckSection {
  type: 'safetyCheck';
  title: string;
  items: SafetyCheckItem[];
}

// Open-ended question for soft skills/leadership (scenario-based reflection)
export interface OpenEndedItem {
  id: string;
  question: string;           // The scenario/question
  prompt: string;             // Guidance like "Describe how you would handle..."
  sampleAnswer: string;       // Example of a strong response
  evaluationCriteria: string[]; // What makes a good answer
}

export interface OpenEndedSection {
  type: 'openEnded';
  title: string;
  questions: OpenEndedItem[];
}

// ============================================
// Unified Task Section Type
// ============================================

// Union type for all task sections - universal + language + code + physical
export type TaskSection =
  // Universal sections (all skill types)
  | QuizSection
  | OpenEndedSection
  // Language-specific sections
  | ToneSelectSection
  | TranslationSection
  | TypingSection
  | RoleplaySection
  | RewriteSection
  // Code-specific sections
  | CodeCompletionSection
  | DebuggingSection
  | AICodeReviewSection
  // Physical-specific sections
  | SafetyCheckSection;

// Sections task format (unified format for ALL skill types)
export interface SectionsTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  format: 'sections';
  passingScore: number;
  sections: TaskSection[];
}

// Mixed task format (legacy alias for language learning, same as SectionsTask)
export interface MixedTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  format: 'mixed';
  passingScore: number;
  sections: TaskSection[];
}


// ============================================
// Open-Ended Question Support
// ============================================

/**
 * Open-ended question categories for higher-order thinking
 * Use when correctness depends on reasoning, not a single answer
 */
export type OpenEndedCategory =
  | 'decision'      // Decision-making under uncertainty
  | 'tradeoff'      // Tradeoff & constraint reasoning
  | 'assumption'    // Assumption surfacing
  | 'diagnostic'    // Diagnostic/debug thinking
  | 'strategy'      // Strategy formation
  | 'reflection'    // Reflection & mental model building
  | 'general';      // General reasoning (leadership, soft skills)

/**
 * Evaluation dimension for open-ended questions
 * Defines WHAT we're looking for and HOW to detect it
 */
export interface EvaluationDimension {
  id: string;
  label: string;              // "Clear decision", "Named tradeoffs"
  hint: string;               // Feedback hint: "Try stating your decision clearly"
  required?: boolean;         // Must be present to pass
  keywords?: string[];        // Presence indicators for basic evaluation
}

/**
 * Configuration for open-ended question evaluation
 */
export interface OpenEndedConfig {
  category: OpenEndedCategory;
  scenario?: string;                    // Optional additional context
  constraints?: string[];               // Optional constraints shown as chips
  minWords?: number;                    // Minimum word count, default 30
  maxWords?: number;                    // Maximum word count (optional)
  evaluationDimensions: EvaluationDimension[];
  showSelfCheck?: boolean;              // Show checklist before submit, default true
}

/**
 * Result of evaluating an open-ended response
 */
export interface OpenEndedResult {
  passed: boolean;
  score: number;                        // 0-1 normalized score
  dimensionResults: {
    dimensionId: string;
    label: string;
    found: boolean;
    hint?: string;
    aiScore?: number;                   // 0-1 AI-assessed quality (Pro only)
    aiFeedback?: string;                // AI-generated specific feedback (Pro only)
  }[];
  feedback: string;

  // AI evaluation fields (Pro users only)
  evaluationType: 'basic' | 'ai';       // Which evaluation was used
  aiOverallFeedback?: string;           // AI-generated holistic feedback
  aiStrengths?: string[];               // What the response did well
  aiImprovements?: string[];            // Specific suggestions to improve
  aiExampleResponse?: string;           // Optional: example of stronger response
}

/**
 * Request to evaluate open-ended response with AI (Pro only)
 */
export interface AIEvaluationRequest {
  questionId: string;
  question: string;
  category: OpenEndedCategory;
  scenario?: string;
  constraints?: string[];
  response: string;
  evaluationDimensions: EvaluationDimension[];
}

/**
 * Response from AI evaluation endpoint
 */
export interface AIEvaluationResponse {
  success: boolean;
  result?: OpenEndedResult;
  error?: string;
  tokensUsed?: number;
  remaining?: number;           // Remaining AI evaluations for free users (-1 = unlimited for Pro)
}

/**
 * Response from AI evaluation remaining check
 */
export interface AIEvaluationRemainingResponse {
  remaining: number;            // -1 = unlimited (Pro user)
  limit: number;                // Daily limit for free users
  isPro: boolean;
}

/**
 * Default evaluation dimensions by category
 * AI uses these when generating open-ended questions
 */
export const OPEN_ENDED_PRESETS: Record<OpenEndedCategory, EvaluationDimension[]> = {
  decision: [
    { id: 'choice', label: 'Stated choice', hint: 'State your decision clearly', required: true, keywords: ['would', 'choose', 'decide', 'go with', 'pick', 'select'] },
    { id: 'reasoning', label: 'Gave reasoning', hint: 'Explain why you chose this', required: true, keywords: ['because', 'since', 'reason', 'due to', 'as'] },
    { id: 'tradeoff', label: 'Acknowledged tradeoff', hint: 'What are you giving up?', keywords: ['but', 'however', 'downside', 'risk', 'cost', 'sacrifice'] },
  ],
  tradeoff: [
    { id: 'priority', label: 'Named priority', hint: 'What matters most here?', required: true, keywords: ['prioritize', 'focus', 'important', 'first', 'main', 'key'] },
    { id: 'sacrifice', label: 'Named sacrifice', hint: 'What are you giving up?', required: true, keywords: ['sacrifice', 'give up', 'less', 'skip', 'accept', 'trade'] },
    { id: 'justification', label: 'Justified choice', hint: 'Why this tradeoff?', keywords: ['because', 'since', 'given', 'constraint'] },
  ],
  assumption: [
    { id: 'listed', label: 'Listed assumptions', hint: 'What are you assuming?', required: true, keywords: ['assume', 'assuming', 'if', 'given that', 'suppose'] },
    { id: 'risk', label: 'Identified risks', hint: 'Which assumptions are risky?', keywords: ['risky', 'uncertain', 'might not', 'could fail', 'biggest risk'] },
  ],
  diagnostic: [
    { id: 'hypotheses', label: 'Listed causes', hint: 'What could be wrong?', required: true, keywords: ['could be', 'might be', 'possibly', 'maybe', 'perhaps', 'likely'] },
    { id: 'testing', label: 'How to test', hint: 'How would you verify?', required: true, keywords: ['check', 'test', 'verify', 'look at', 'examine', 'debug', 'log'] },
    { id: 'priority', label: 'Prioritized', hint: 'What would you check first?', keywords: ['first', 'start with', 'most likely', 'probably'] },
  ],
  strategy: [
    { id: 'steps', label: 'Ordered steps', hint: 'List your steps in order', required: true, keywords: ['first', 'then', 'next', 'finally', 'step', '1.', '2.', '3.'] },
    { id: 'rationale', label: 'Explained order', hint: 'Why this sequence?', keywords: ['because', 'before', 'depends', 'enables', 'blocks', 'requires'] },
    { id: 'risks', label: 'Noted risks', hint: 'What could go wrong?', keywords: ['risk', 'might fail', 'watch out', 'careful', 'if not'] },
  ],
  reflection: [
    { id: 'insight', label: 'Stated insight', hint: 'What did you learn?', required: true, keywords: ['learned', 'realized', 'now understand', 'see that', 'insight'] },
    { id: 'contrast', label: 'Before/after', hint: 'How did your thinking change?', keywords: ['before', 'now', 'used to', 'changed', 'thought'] },
    { id: 'application', label: 'Future use', hint: 'How will you apply this?', keywords: ['next time', 'going forward', 'will use', 'apply'] },
  ],
  general: [
    { id: 'position', label: 'Stated position', hint: 'Make your point clear', required: true, keywords: ['think', 'believe', 'would', 'should', 'recommend'] },
    { id: 'support', label: 'Supported reasoning', hint: 'Explain your thinking', required: true, keywords: ['because', 'since', 'example', 'instance', 'reason'] },
    { id: 'consideration', label: 'Considered alternatives', hint: 'What else did you consider?', keywords: ['alternatively', 'other option', 'could also', 'on the other hand'] },
  ],
};

/**
 * Evaluate an open-ended response using presence checks
 * Machine-gradable, no AI required
 */
export function evaluateOpenEndedResponse(
  response: string,
  config: OpenEndedConfig,
  selfCheckResults?: Record<string, boolean>
): OpenEndedResult {
  const text = response.toLowerCase();
  const wordCount = response.trim().split(/\s+/).filter(Boolean).length;
  const minWords = config.minWords || 30;

  const dimensionResults = config.evaluationDimensions.map(dim => {
    // Check for keyword presence
    let found = dim.keywords?.some(kw => text.includes(kw.toLowerCase())) || false;

    // If user self-checked and we didn't find keywords, give partial credit
    if (!found && selfCheckResults?.[dim.id]) {
      found = true; // Trust user's self-assessment
    }

    // If response is long enough, be more lenient
    if (!found && wordCount >= minWords * 2) {
      found = true; // Assume thorough response covers it
    }

    return {
      dimensionId: dim.id,
      label: dim.label,
      found,
      hint: found ? undefined : dim.hint,
    };
  });

  // Calculate score
  const foundCount = dimensionResults.filter(r => r.found).length;
  const totalCount = dimensionResults.length;
  const score = totalCount > 0 ? foundCount / totalCount : 0;

  // Check if all required dimensions are met
  const requiredMet = config.evaluationDimensions
    .filter(d => d.required)
    .every(d => dimensionResults.find(r => r.dimensionId === d.id)?.found);

  const passed = requiredMet && score >= 0.5 && wordCount >= minWords;

  // Generate feedback
  const missing = dimensionResults.filter(r => !r.found);
  const feedback = passed
    ? 'Good reasoning! You addressed the key elements.'
    : missing.length > 0
    ? `Consider: ${missing.map(m => m.hint).join('. ')}`
    : `Response too short. Aim for at least ${minWords} words.`;

  return { passed, score, dimensionResults, feedback, evaluationType: 'basic' };
}

export interface QuizQuestion {
  id: string;
  question: string;

  // Response type: 'choice' (default MCQ) or 'openEnded'
  responseType?: 'choice' | 'openEnded';

  // For 'choice' type (existing MCQ behavior)
  options?: string[];      // 4 options
  correctIndex?: number;
  explanation?: string;

  // For 'openEnded' type (new)
  openEndedConfig?: OpenEndedConfig;

  // Concept-teaching fields (task1 is now the core learning activity)
  conceptTitle?: string;       // Short concept name (e.g., "REST API Basics")
  realWorldContext?: string;   // Why this matters in practice (1 sentence)
  caseStudy?: EmbeddedCaseStudy;  // Optional: decision-making scenario with consequences per option

  // Audio support for listening questions (language learning)
  audioText?: string;     // Text to speak via browser TTS before showing question
  audioUrl?: string;      // Optional pre-recorded audio
  audioLanguage?: TargetLanguage; // Language for TTS (if different from session)
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

// Union type for all task formats
export type TaskContent = Task | QuizTask | MixedTask | SectionsTask;


// AI-generated setup instructions for StackBlitz/code sandbox
export interface SetupInstructions {
  files: Array<{ path: string; description: string }>;
  steps: string[];
  runCommand?: string;
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

  // Solution-first approach (new)
  solutionCode?: string;          // AI-generated solution (primary code)
  solutionExplanation?: string;   // What this code does
  solutionAnnotations?: string[]; // Key lines explained

  // Challenge options (new)
  challengeOptions?: {
    writeYourself: {
      description: string;        // "Write this code from scratch"
      hints: Array<{ level: number; hint: string }>;
    };
    makeItRun: {
      description: string;        // "Copy the AI code and make it run"
      setupSteps: string[];       // Steps to get it running
      possibleIssues?: string[];  // Common issues AI code might have
    };
  };

  // Legacy fields (for backward compatibility)
  starterCode?: string;           // Code to start with (deprecated: use solutionCode)
  expectedOutput?: string;        // What the result should look like
  hints?: Array<{ level: number; hint: string } | string>;
  solution?: string;              // Deprecated: use solutionCode

  // Validation
  validationType: 'run' | 'visual' | 'test';  // How user validates their work
  validationInstructions?: string;             // "Run the code and check console"

  // AI-generated setup instructions for StackBlitz
  setupInstructions?: SetupInstructions;
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

  // AI-generated setup instructions for StackBlitz
  setupInstructions?: SetupInstructions;

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
  taskType: 'task1' | 'practice' | 'boss' | 'bossMicroStep' | 'reflection' | 'quiz';
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
  video: VideoMatch;            // Conditional based on skill type
  task1?: QuizTask | SectionsTask;  // Core learning activity (Duolingo-style)
  foundationCards?: FoundationCard[];   // Legacy: kept for backward compat with cached data
  languageFoundationCards?: LanguageFoundationCard[]; // Legacy: kept for backward compat
  bossMilestone?: BossMilestone;    // Daily micro-step for boss project coding
  skipTest?: SkipTest;
}

// Mini foundation card for intensive practice (shorter, no micro question)
export interface MiniFoundationCard {
  id: string;
  concept: string;           // One-line title
  explanation: string;       // 100-150 words (shorter than regular 200-300)
  // No microQuestion - understanding tested in exercise sections
}

// Intensive practice for practice-based learning (shown in bossMilestone step)
export interface IntensivePractice {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  miniFoundationCards?: MiniFoundationCard[];  // 2-4 cards introducing new concepts (shown before exercises)
  sections: TaskSection[];                     // Exactly 2 sections
}

// Open Task - real-world practice challenge (for practice-based learning)
export interface OpenTask {
  id: string;
  sectionType: 'openTask';
  sectionTitle: string;           // "Real-World Challenge"
  sectionSubtitle: string;        // "Take your learning beyond the screen"
  title: string;                  // "Have a 1-on-1 with a team member"
  description: string;            // What to do and why
  icon: string;                   // Emoji: 💬, 🎯, 🤝, etc.
  context: string;                // "At work", "With a friend", etc.
  difficulty: 'easy' | 'medium' | 'challenging';
  conceptConnection: string;      // Which foundationCard concept this applies
  estimatedMinutes: number;
  tips: string[];                 // Practical tips for success
  completionType: 'self-reported';
  reflectionPrompts: string[];    // Questions for after completion
}

export interface DayDeferredContent {
  task1?: QuizTask | SectionsTask;  // Legacy: old cached data may have task1 here
  task2?: Task;
  intensivePractice?: IntensivePractice;  // For practice-based learning
  openTask?: OpenTask;                     // Real-world practice challenge (practice-based)
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
  daysCompletedToday?: {
    used: number;
    limit: number;
    remaining: number;
  };
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
  | 'foundationCards'  // Legacy: kept for backward compat with old sessions
  | 'task1'
  | 'bossMilestone'
  | 'openTask'
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
// Training Mode Types
// ============================================

export interface ScoringDimension {
  name: string;
  score: number;
  feedback: string;
}

export interface ScoringResult {
  dimensions?: ScoringDimension[];
  gaps?: string[];
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  feedback: string;
  microFixes?: string[];
}

export interface TrainingConfig {
  goalType: GoalType;
  name: string;
  subtitle: string;
  stepFlow: SessionStep[];
  stepLabels: Record<string, string>;
  hasTimedAttempt: boolean;
  scoringType: 'rubric' | 'feedback' | 'none';
  defaultTimerMinutes: number;
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
 * Output types - what the user wants to achieve from learning.
 * Universal across all skill types (code, knowledge, physical).
 *
 * - learn_and_apply: Learn deeply AND apply practically. Default for curriculum/language modes.
 * - ship_project: Ship something real. End-to-end, deployment, best practices.
 */
export type OutputType =
  | 'learn_and_apply'
  | 'ship_project';

// Refinement context (from Step 3b if user selects "Not quite")
export interface RefinementContext {
  outputType?: OutputType;
  usageContext?: 'work' | 'personal' | 'interview' | 'school';
  platformTolerance?: 'any' | 'preferGeneric' | 'genericOnly';
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

  // Feeling-based inputs (replaces explicit skill level questions)
  familiarity?: 'new' | 'know_basics' | 'skilled';  // How familiar with topic
  sessionLength?: 'short' | 'medium' | 'long';      // Daily learning time availability

  // Training mode goal type (from onboarding mode selection)
  goalType?: GoalType;

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
  outputType?: OutputType; // What user wants to achieve
  usageContext?: 'work' | 'personal' | 'interview' | 'school';
  // Feeling-based inputs (replaces skill level & time questions)
  familiarity?: string;     // 'new' | 'know_basics' | 'skilled'
  sessionLength?: string;   // 'short' | 'medium' | 'long'
  // Learning style preference
  learningStyle?: 'projects' | 'practice'; // 'projects' = boss project, 'practice' = exercises only
  // Advanced mode: enables code writing exercises (codeCompletion) in intensive practice
  codeWritingEnabled?: boolean;
  // Training mode goal type
  goalType?: GoalType;
  // Analytics: time spent in onboarding flow (tracked client-side)
  durationSeconds?: number;
}

// ============================================
// Rep Types (Practice Scenarios)
// ============================================

export interface RepScenarioTask {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
}

export interface RepScenario {
  title: string;
  briefing: string;
  tasks: RepScenarioTask[];
  estimatedMinutes: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  skillTags: string[];
}

export interface RepHintRevealed {
  taskIndex: number;
  level: number;
  hint: string;
  encouragement: string;
}

export interface RepCoachMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface RepSkillEvaluation {
  dimension: string;
  score: number;
  evidence: string;
  gap: string;
}

export interface RepFeedback {
  execution: {
    completionAnalysis: string;
    timeEfficiency: string;
    hintDependency: string;
  };
  skillEvaluation: RepSkillEvaluation[];
  improvementPlan: {
    immediateActions: string[];
    conceptsToStudy: string[];
    suggestedNextRep: string;
    resourceHints: string[];
    methodToImprove: Array<{ dimension: string; method: string }>;
  };
  growthSignal: {
    comparedToStart: string;
    confidenceCalibration: string;
    encouragement: string;
  };
  suggestedTopics: string[];
}

export interface Rep {
  id: string;
  userId: string;
  skillName: string;
  topic: string;
  scenario: RepScenario;
  scenarioOptions: RepScenario[] | null;
  scratchPadContent: string | null;
  coachConversation: RepCoachMessage[];
  hintsUsed: number;
  hintsRevealed: RepHintRevealed[];
  completed: boolean;
  timeSpentSeconds: number;
  confidenceScore: number | null;
  feedback: RepFeedback | null;
  sourceSessionId: string | null;
  sourceConcept: string | null;
  createdAt: string;
  updatedAt: string;
}
