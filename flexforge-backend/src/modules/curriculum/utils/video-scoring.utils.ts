/**
 * Video Scoring Utilities
 * Standalone scoring functions used by VideoMatchingService and tests
 */

import {
  CONTENT_SIGNALS,
  getChannelPolicy,
} from '../services/youtube-policy';

// ============================================
// TYPES
// ============================================

export interface ScoringVideo {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  duration: number;
  hasChapters: boolean;
  hasRepository: boolean;
  chapters?: Array<{ title: string; startSeconds: number }>;
}

export interface ScoringContext {
  concept: string;
  userSlot: number;
  userLevel: 'beginner' | 'intermediate' | 'advanced';
}

// ============================================
// SCORING WEIGHTS
// ============================================

export const SCORING_WEIGHTS = {
  beginner: {
    conceptMatch: 0.25,
    channelTrust: 0.25,
    durationFit: 0.10,
    cognitiveLoad: 0.10,
    engagement: 0.10,
    segmentability: 0.20,
  },
  intermediate: {
    conceptMatch: 0.30,
    channelTrust: 0.15,
    durationFit: 0.10,
    cognitiveLoad: 0.10,
    engagement: 0.10,
    segmentability: 0.25,
  },
  advanced: {
    conceptMatch: 0.35,
    channelTrust: 0.10,
    durationFit: 0.10,
    cognitiveLoad: 0.10,
    engagement: 0.10,
    segmentability: 0.25,
  },
};

// Marketing penalty weight by level (beginners more sensitive)
export const MARKETING_WEIGHTS: Record<string, number> = {
  beginner: 0.5,
  intermediate: 0.4,
  advanced: 0.3,
};

// ============================================
// COGNITIVE SIGNALS
// ============================================

export const COGNITIVE_SIGNALS = {
  beginner: {
    positive: ['for beginners', 'simply', 'easy', 'basic', 'introduction', 'intro to', 'getting started', 'first'],
    negative: ['advanced', 'deep dive', 'under the hood', 'internals', 'vs', 'performance'],
  },
  intermediate: {
    positive: ['tutorial', 'explained', 'how to', 'in practice', 'real world'],
    negative: ['for beginners', 'basics', 'internals'],
  },
  advanced: {
    positive: ['deep dive', 'under the hood', 'internals', 'performance', 'architecture', 'advanced'],
    negative: ['for beginners', 'basics', 'introduction'],
  },
};

// ============================================
// CONCEPT SYNONYMS
// ============================================

export const CONCEPT_SYNONYMS: Record<string, string[]> = {
  usestate: ['state', 'react state', 'state hook', 'state management', 'usestate'],
  useeffect: ['effect', 'side effect', 'lifecycle', 'effect hook', 'useeffect'],
  props: ['properties', 'component props', 'passing data', 'props'],
  component: ['components', 'react component', 'functional component'],
  api: ['rest api', 'fetch', 'http', 'endpoints', 'backend', 'api'],
  async: ['asynchronous', 'promises', 'await', 'async/await', 'async'],
  hook: ['hooks', 'react hook', 'custom hook'],
  reducer: ['usereducer', 'reducer', 'state reducer'],
  context: ['usecontext', 'context api', 'react context'],
  typescript: ['ts', 'type script', 'types', 'typescript'],
  javascript: ['js', 'java script', 'javascript'],
  python: ['py', 'python'],
  node: ['nodejs', 'node.js', 'node'],
  react: ['reactjs', 'react.js', 'react'],
  vue: ['vuejs', 'vue.js', 'vue'],
  angular: ['angularjs', 'angular.js', 'angular'],
  next: ['nextjs', 'next.js', 'next'],
  express: ['expressjs', 'express.js', 'express'],
  mongo: ['mongodb', 'mongo db', 'mongo'],
  sql: ['mysql', 'postgresql', 'database', 'sql'],
  css: ['styling', 'styles', 'stylesheet', 'css'],
  html: ['markup', 'html5', 'html'],
  git: ['github', 'version control', 'git'],
  docker: ['containers', 'containerization', 'docker'],
  kubernetes: ['k8s', 'container orchestration', 'kubernetes'],
  aws: ['amazon web services', 'cloud', 'aws'],
  testing: ['tests', 'unit test', 'jest', 'testing'],
  automation: ['automate', 'workflow', 'zapier', 'automation'],
  ai: ['artificial intelligence', 'machine learning', 'ml', 'ai'],
};

// ============================================
// SCORING FUNCTIONS
// ============================================

/**
 * Score marketing penalty (0-30)
 * Higher = more marketing signals = worse
 */
export function scoreMarketingPenalty(video: ScoringVideo): number {
  let hardPenalty = 0;
  let softPenalty = 0;
  const combined = (video.title + ' ' + video.description).toLowerCase();
  const titleLower = video.title.toLowerCase();
  const matchedSignals = new Set<string>();

  // Check for hard marketing signals: +10 each (dedupe)
  for (const signal of CONTENT_SIGNALS.negative.hard) {
    const signalLower = signal.toLowerCase();
    if (combined.includes(signalLower) && !matchedSignals.has(signalLower)) {
      matchedSignals.add(signalLower);
      hardPenalty += 10;
    }
  }

  // Check for soft marketing signals: +3 each
  for (const signal of CONTENT_SIGNALS.negative.soft) {
    const signalLower = signal.toLowerCase();
    if (combined.includes(signalLower) && !matchedSignals.has(signalLower)) {
      matchedSignals.add(signalLower);
      softPenalty += 3;
    }
  }
  softPenalty = Math.min(12, softPenalty); // Cap soft signals

  // Vendor self-promotion detection: channel name appears in video title
  let vendorPenalty = 0;
  if (video.channelName) {
    const channelWords = video.channelName.toLowerCase()
      .split(/[\s\-_]+/)
      .filter(w => w.length > 3);

    for (const word of channelWords) {
      if (titleLower.includes(word)) {
        vendorPenalty = 15;
        break;
      }
    }
  }

  // Channel marketing level
  let channelPenalty = 0;
  const channelInfo = getChannelPolicy(video.channelId);
  if (channelInfo.channel) {
    const marketingPenalties: Record<string, number> = {
      none: 0,
      light: 2,
      moderate: 5,
      heavy: 10,
    };
    channelPenalty = marketingPenalties[channelInfo.channel.marketingLevel] || 0;
  }

  return Math.min(30, hardPenalty + softPenalty + channelPenalty + vendorPenalty);
}

/**
 * Score channel trust (0-100)
 */
export function scoreChannelTrust(video: ScoringVideo): number {
  const channelInfo = getChannelPolicy(video.channelId);

  if (channelInfo.channel) {
    const trustScores: Record<string, number> = {
      excellent: 95,
      good: 80,
      moderate: 65,
      poor: 40,
    };
    return trustScores[channelInfo.channel.contentQuality] || 60;
  }

  // Unknown channel - base score
  return 60;
}

/**
 * Score concept match (0-100)
 */
export function scoreConceptMatch(video: ScoringVideo, context: ScoringContext): number {
  let score = 50;
  const titleLower = video.title.toLowerCase();
  const descLower = video.description.toLowerCase();
  const conceptLower = context.concept.toLowerCase();

  // Exact concept in title: +30
  if (titleLower.includes(conceptLower)) {
    score += 30;
  }

  // Concept words in title: +10 per word
  const conceptWords = conceptLower.split(' ').filter(w => w.length > 2);
  for (const word of conceptWords) {
    if (titleLower.includes(word)) {
      score += 10;
    }
  }

  // Check synonyms
  for (const [token, synonyms] of Object.entries(CONCEPT_SYNONYMS)) {
    if (conceptLower.includes(token)) {
      for (const synonym of synonyms) {
        if (titleLower.includes(synonym) || descLower.includes(synonym)) {
          score += 5;
          break;
        }
      }
    }
  }

  // Concept in description: +8
  if (descLower.includes(conceptLower)) {
    score += 8;
  }

  // Chapter titles contain concept: +12
  if (video.chapters) {
    const chapterContainsConcept = video.chapters.some(ch =>
      ch.title.toLowerCase().includes(conceptLower) ||
      conceptWords.some(word => ch.title.toLowerCase().includes(word)),
    );
    if (chapterContainsConcept) {
      score += 12;
    }
  }

  return Math.max(30, Math.min(100, score));
}

/**
 * Score duration fit (0-100)
 */
export function scoreDurationFit(video: ScoringVideo, context: ScoringContext): number {
  const targetDuration = context.userSlot * 60;
  const ratio = video.duration / targetDuration;

  // Perfect fit: 0.8 to 1.5x target
  if (ratio >= 0.8 && ratio <= 1.5) {
    return 100;
  }

  // Acceptable: 0.5 to 3x target
  if (ratio >= 0.5 && ratio <= 3) {
    return 75;
  }

  // Too short or too long
  if (ratio < 0.5) {
    return 40; // Too short
  }

  // Very long but has chapters (can segment)
  if (video.hasChapters) {
    return 60;
  }

  return 30; // Too long, no chapters
}

/**
 * Score cognitive load (0-100)
 */
export function scoreCognitiveLoad(video: ScoringVideo, context: ScoringContext): number {
  const titleLower = video.title.toLowerCase();
  const signals = COGNITIVE_SIGNALS[context.userLevel];
  let score = 70;

  // Positive signals for this level: +5 each
  for (const signal of signals.positive) {
    if (titleLower.includes(signal)) {
      score += 5;
    }
  }

  // Negative signals for this level: -8 each
  for (const signal of signals.negative) {
    if (titleLower.includes(signal)) {
      score -= 8;
    }
  }

  // Duration-based cognitive load
  const durationMinutes = video.duration / 60;
  if (context.userLevel === 'beginner') {
    if (durationMinutes >= 5 && durationMinutes <= 15) {
      score += 10;
    } else if (durationMinutes > 30 && !video.hasChapters) {
      score -= 10;
    }
  }

  return Math.max(30, Math.min(100, score));
}

/**
 * Score engagement potential (0-100)
 */
export function scoreEngagement(video: ScoringVideo): number {
  let score = 60;

  if (video.hasRepository) {
    score += 15;
  }

  if (video.hasChapters) {
    score += 10;
  }

  // Longer descriptions often indicate more thorough content
  if (video.description.length > 500) {
    score += 5;
  }

  return Math.min(100, score);
}

/**
 * Score segmentability (0-100)
 */
export function scoreSegmentability(video: ScoringVideo): number {
  let score = 50;

  // Chapters make segmentation easy
  if (video.hasChapters) {
    score += 30;
  }

  // Good duration range for segmentation
  if (video.duration >= 300 && video.duration <= 1200) {
    score += 10;
  }

  // Very long videos need chapters
  if (video.duration > 1800 && !video.hasChapters) {
    score -= 20;
  }

  return Math.max(20, Math.min(100, score));
}

/**
 * Calculate total weighted score
 */
export function calculateTotalScore(
  video: ScoringVideo,
  context: ScoringContext,
): { total: number; scores: Record<string, number> } {
  const weights = SCORING_WEIGHTS[context.userLevel];
  const mw = MARKETING_WEIGHTS[context.userLevel] ?? 0.4;

  const scores = {
    conceptMatch: scoreConceptMatch(video, context),
    channelTrust: scoreChannelTrust(video),
    marketingPenalty: scoreMarketingPenalty(video),
    durationFit: scoreDurationFit(video, context),
    cognitiveLoad: scoreCognitiveLoad(video, context),
    engagement: scoreEngagement(video),
    segmentability: scoreSegmentability(video),
  };

  const total =
    scores.conceptMatch * weights.conceptMatch +
    scores.channelTrust * weights.channelTrust +
    scores.durationFit * weights.durationFit +
    scores.cognitiveLoad * weights.cognitiveLoad +
    scores.engagement * weights.engagement +
    scores.segmentability * weights.segmentability -
    scores.marketingPenalty * mw;

  return { total, scores };
}
