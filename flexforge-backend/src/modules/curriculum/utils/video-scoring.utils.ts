/**
 * Video Scoring Utilities
 * Standalone scoring functions used by VideoMatchingService and tests
 */

import {
  CONTENT_SIGNALS,
  getChannelPolicy,
} from '../services/youtube-policy';

// ============================================
// UNIFIED PROMOTIONAL SIGNALS
// Single source of truth for all promo detection
// ============================================

export const PROMO_SIGNALS = {
  // CTA & Funnel phrases - signals promotional intent
  cta: [
    'join my community', 'link in the description', 'link below', 'free training',
    'sign up here', 'sign up now', 'book a call', 'apply now', 'limited spots',
    'discount code', 'early access', 'exclusive access', 'free guide', 'free ebook',
    'free template', 'check out my', 'subscribe for more', 'hit the bell',
    'join the waitlist', 'spots are filling', 'doors are closing', 'enrollment opens',
    'click the link', 'grab your', 'get your free', 'download my', 'use code',
    'click below', 'use my code', 'promo code', 'special offer', 'limited time',
    'start your free trial', 'sign up for free',
  ],

  // Monetization signals - courses, coaching, etc.
  monetization: [
    'my course', 'my coaching', 'my mentorship', 'my program', 'my accelerator',
    'my bootcamp', 'my agency', 'my community', 'premium members', 'paid members',
    'inner circle', 'mastermind', 'private group', 'vip access', 'pro version',
    'full course', 'complete course', 'paid training', 'coaching call',
    'enroll', 'newsletter', 'join my',
  ],

  // Affiliate/tracking patterns (regex-friendly)
  affiliatePatterns: [
    'affiliate', 'aff=', 'ref=', 'utm_', 'partner=', 'coupon', 'discount',
  ],

  // Self-promo phrases in description
  selfPromo: [
    'join', 'enroll', 'my course', 'bootcamp', 'cohort', 'community',
    'mentorship', 'patreon', 'newsletter',
  ],

  // Platform/vendor tool names for tool-heavy detection
  platformTools: [
    'zapier', 'make.com', 'make', 'integromat', 'airtable', 'notion', 'hubspot',
    'vapi', 'openai', 'anthropic', 'claude', 'chatgpt', 'gpt-4', 'gpt-3',
    'clickup', 'monday', 'asana', 'trello', 'slack', 'discord',
    'webflow', 'bubble', 'adalo', 'glide', 'softr', 'retool',
    'stripe', 'gumroad', 'teachable', 'kajabi', 'thinkific', 'podia',
    'mailchimp', 'convertkit', 'beehiiv', 'substack', 'lemlist', 'instantly',
    'calendly', 'cal.com', 'typeform', 'tally', 'jotform',
    'figma', 'canva', 'midjourney', 'dall-e', 'stable diffusion',
    'eleven labs', 'heygen', 'synthesia', 'd-id', 'runway',
  ],

  // Brands that often create promotional tutorials
  promoBrands: [
    'notion', 'zapier', 'airtable', 'webflow', 'clickup', 'hubspot', 'make.com',
    'jasper', 'semrush', 'canva', 'figma', 'slack', 'asana', 'monday', 'trello',
    'mailchimp', 'salesforce', 'shopify', 'wix', 'squarespace', 'wordpress',
    'stripe', 'twilio', 'sendgrid', 'intercom', 'zendesk', 'freshdesk',
  ],

  // Vendor self-identification patterns
  vendorSelf: [
    'at zapier we', 'at notion we', 'at airtable we', 'at monday we',
    'at clickup we', 'at asana we', 'at hubspot we', 'here at',
    'our team', 'our company', 'our customers', 'our users love',
    'with our', 'using our', "we've built", 'we designed',
    'our platform', 'our product', 'our tool', 'our software', 'our solution',
  ],

  // Sponsorship signals
  sponsorship: [
    'paid promotion', 'paid partnership', 'sponsored by', 'thanks to our sponsor',
  ],
};

// ============================================
// TRANSCRIPT PROMOTIONAL SCAN (FREE - no AI)
// ============================================

export interface TranscriptScanResult {
  isPromotional: boolean;        // True if video appears promotional
  penalty: number;               // 0-50 penalty score
  strongMatches: string[];       // Strong promotional signals found
  vendorMatches: string[];       // Vendor self-promo found
  ctaMatches: string[];          // Call-to-action patterns found
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Scan transcript for promotional content (FREE - no AI tokens)
 * Call this during Layer 3 verification to catch videos with clean titles
 * but promotional content.
 *
 * @param transcriptText - Full or sampled transcript text
 * @returns Scan result with penalty and matched keywords
 */
export function scanTranscriptForPromotion(transcriptText: string): TranscriptScanResult {
  const textLower = transcriptText.toLowerCase();
  const strongMatches: string[] = [];
  const vendorMatches: string[] = [];
  const ctaMatches: string[] = [];

  // Check strong promotional signals
  for (const keyword of CONTENT_SIGNALS.transcript.strong) {
    if (textLower.includes(keyword.toLowerCase())) {
      strongMatches.push(keyword);
    }
  }

  // Check vendor self-promotion
  for (const keyword of CONTENT_SIGNALS.transcript.vendor) {
    if (textLower.includes(keyword.toLowerCase())) {
      vendorMatches.push(keyword);
    }
  }

  // Check call-to-action patterns
  for (const keyword of CONTENT_SIGNALS.transcript.cta) {
    if (textLower.includes(keyword.toLowerCase())) {
      ctaMatches.push(keyword);
    }
  }

  // Calculate penalty
  // Strong matches: 10 points each (max 30)
  // Vendor matches: 8 points each (max 16)
  // CTA matches: 4 points each (max 8)
  const strongPenalty = Math.min(30, strongMatches.length * 10);
  const vendorPenalty = Math.min(16, vendorMatches.length * 8);
  const ctaPenalty = Math.min(8, ctaMatches.length * 4);
  const totalPenalty = Math.min(50, strongPenalty + vendorPenalty + ctaPenalty);

  // Determine if promotional (LOWERED threshold for better detection)
  // High confidence: 2+ strong matches OR 1 strong + 1 vendor/cta
  // Medium: 1 strong OR 2+ vendor/cta combined
  const totalMatches = strongMatches.length + vendorMatches.length + ctaMatches.length;
  const isPromotional = strongMatches.length >= 2 ||
                        (strongMatches.length >= 1 && (vendorMatches.length + ctaMatches.length) >= 1) ||
                        (vendorMatches.length + ctaMatches.length) >= 3;

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (strongMatches.length >= 2 || (strongMatches.length >= 1 && vendorMatches.length >= 1)) {
    confidence = 'high';
  } else if (strongMatches.length >= 1 || totalMatches >= 3) {
    confidence = 'medium';
  }

  return {
    isPromotional,
    penalty: totalPenalty,
    strongMatches,
    vendorMatches,
    ctaMatches,
    confidence,
  };
}

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
 * Score marketing penalty (0-50)
 * Higher = more marketing signals = worse
 * Enhanced with link density, affiliate patterns, and tool-first detection
 */
export function scoreMarketingPenalty(video: ScoringVideo): number {
  let hardPenalty = 0;
  let softPenalty = 0;
  let linkPenalty = 0;
  let affiliatePenalty = 0;
  const combined = (video.title + ' ' + video.description).toLowerCase();
  const titleLower = video.title.toLowerCase();
  const descLower = video.description.toLowerCase();
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

  // B1: Link density + affiliate patterns in description
  const urlMatches = video.description.match(/https?:\/\/\S+/gi) || [];
  if (urlMatches.length >= 5) {
    linkPenalty += 6; // Resource dump = often promotional
  }
  // Check affiliate patterns using shared signals
  const affiliateRegex = new RegExp(PROMO_SIGNALS.affiliatePatterns.join('|'), 'i');
  if (affiliateRegex.test(video.description)) {
    affiliatePenalty += 8;
  }
  // Check self-promo phrases using shared signals
  const selfPromoRegex = new RegExp(PROMO_SIGNALS.selfPromo.join('|'), 'i');
  if (selfPromoRegex.test(descLower)) {
    affiliatePenalty += 6;
  }

  // Vendor self-promotion detection: channel name appears in video title
  let vendorPenalty = 0;
  if (video.channelName) {
    const channelWords = video.channelName.toLowerCase()
      .replace(/\s*(official|channel|tutorials?|academy|learning|hq|tv)\s*/gi, '')
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

  return Math.min(50, hardPenalty + softPenalty + channelPenalty + vendorPenalty + linkPenalty + affiliatePenalty);
}

/**
 * Detect if transcript is tool-first (promotional brand tutorial)
 * Returns penalty if brand mentions heavily outweigh concept mentions
 */
export function scoreToolFirstPenalty(transcriptText: string, concept: string): number {
  const textLower = transcriptText.toLowerCase();
  const conceptLower = concept.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Count brand mentions using shared signals
  let brandHits = 0;
  for (const brand of PROMO_SIGNALS.promoBrands) {
    const regex = new RegExp(`\\b${brand}\\b`, 'gi');
    const matches = textLower.match(regex) || [];
    brandHits += matches.length;
  }

  // Count concept mentions
  const conceptRegex = new RegExp(conceptLower, 'gi');
  const conceptHits = (textLower.match(conceptRegex) || []).length;

  // If brand mentions dominate, it's likely promotional
  if (brandHits >= 8 && conceptHits <= 1) {
    return 8;
  }
  if (brandHits >= 5 && conceptHits === 0) {
    return 6;
  }

  return 0;
}

/**
 * Score CTA ratio in transcript
 * High CTA density = promotional content
 * Uses shared PROMO_SIGNALS for consistent detection
 */
export function scoreCTARatio(transcriptText: string): number {
  const textLower = transcriptText.toLowerCase();
  // Combine CTA + monetization + sponsorship signals for comprehensive detection
  const allCtaSignals = [
    ...PROMO_SIGNALS.cta,
    ...PROMO_SIGNALS.monetization,
    ...PROMO_SIGNALS.sponsorship,
  ];
  let hits = 0;
  for (const signal of allCtaSignals) {
    const regex = new RegExp(signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = textLower.match(regex);
    if (matches) hits += matches.length;
  }
  const perK = hits / Math.max(1, transcriptText.length / 1000);

  if (perK > 2.0) return 12;
  if (perK > 1.5) return 10;
  if (perK > 1.0) return 6;

  return 0;
}

// ============================================
// COMPREHENSIVE PROMOTIONAL ANALYSIS
// ============================================

export interface PromoAnalysisResult {
  // Overall verdict
  verdict: 'reject' | 'allow_with_warning' | 'allow_tagged' | 'ideal';
  verdictReason: string;

  // A: CTA & Funnel Detection
  ctaHits: number;
  ctaDensity: number;           // per minute
  monetizationHits: number;
  promoLevel: 'none' | 'soft' | 'moderate' | 'strong';

  // B: Platform-Heavy Detection
  toolMentions: number;
  isPlatformHeavy: boolean;
  dominantTools: string[];

  // C: Hard-Sell Detection (segment analysis)
  lastQuarterPromoDensity: number;
  isHardSell: boolean;

  // D: Teaching vs Tool-Demo
  teachingRatio: number;        // 0-1, higher = more teaching
  isToolDemo: boolean;

  // Recommended action
  recommendedSegments?: { start: number; end: number; type: 'learn' | 'skip' }[];
  totalPenalty: number;
}

/**
 * Count phrase matches in text
 */
function countPhraseMatches(text: string, phrases: string[]): number {
  const textLower = text.toLowerCase();
  let count = 0;
  for (const phrase of phrases) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = textLower.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Count tool/platform mentions
 */
function countToolMentions(text: string): { total: number; breakdown: Record<string, number> } {
  const textLower = text.toLowerCase();
  const breakdown: Record<string, number> = {};
  let total = 0;

  for (const tool of PROMO_SIGNALS.platformTools) {
    const regex = new RegExp(`\\b${tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = textLower.match(regex);
    if (matches) {
      breakdown[tool] = matches.length;
      total += matches.length;
    }
  }

  return { total, breakdown };
}

/**
 * Detect teaching vs tool-demo content
 * Teaching signals: explains why, general concepts, principles
 * Tool-demo signals: click here, button instructions, UI navigation
 */
function analyzeTeachingRatio(text: string): number {
  const textLower = text.toLowerCase();

  // Teaching signals
  const teachingPhrases = [
    'the reason', 'because', 'why this', 'the concept', 'in principle',
    'fundamentally', 'the idea is', 'think of it as', 'imagine',
    'for example', 'let me explain', 'understand', 'learn',
    'the key is', 'important to note', 'remember that',
  ];

  // Tool-demo signals
  const demoPhrases = [
    'click here', 'click on', 'press the', 'go to', 'open the',
    'select the', 'choose the', 'drag and drop', 'in the dashboard',
    'on the left', 'on the right', 'at the top', 'at the bottom',
    'in the menu', 'in settings', 'copy this', 'paste it',
    'create a new', 'add a new', 'delete the', 'edit the',
  ];

  const teachingHits = countPhraseMatches(textLower, teachingPhrases);
  const demoHits = countPhraseMatches(textLower, demoPhrases);

  const total = teachingHits + demoHits;
  if (total === 0) return 0.5; // neutral

  return teachingHits / total;
}

/**
 * Analyze transcript segments for promotional density
 * Returns promo density for each segment (0-1)
 */
function analyzeSegments(
  transcript: Array<{ text: string; start: number }>,
  videoDurationSec: number,
): { segmentDensities: number[]; lastQuarterDensity: number } {
  if (transcript.length === 0) {
    return { segmentDensities: [], lastQuarterDensity: 0 };
  }

  // Split into 4 quarters
  const quarterDuration = videoDurationSec / 4;
  const quarters: string[] = ['', '', '', ''];

  for (const entry of transcript) {
    const quarterIndex = Math.min(3, Math.floor(entry.start / quarterDuration));
    quarters[quarterIndex] += ' ' + entry.text;
  }

  // Calculate promo density for each quarter using shared signals
  const allPromoWords = [...PROMO_SIGNALS.cta, ...PROMO_SIGNALS.monetization];
  const segmentDensities = quarters.map(q => {
    const words = q.split(/\s+/).length;
    if (words < 10) return 0;
    const hits = countPhraseMatches(q, allPromoWords);
    return hits / (words / 100); // per 100 words
  });

  return {
    segmentDensities,
    lastQuarterDensity: segmentDensities[3] || 0,
  };
}

/**
 * Comprehensive promotional analysis
 * Combines all detection methods for a complete picture
 */
export function analyzePromoContent(
  transcript: Array<{ text: string; start: number }>,
  videoDurationSec: number,
): PromoAnalysisResult {
  const fullText = transcript.map(t => t.text).join(' ');
  const videoMinutes = videoDurationSec / 60;

  // A: CTA & Funnel Detection using shared signals
  const ctaHits = countPhraseMatches(fullText, PROMO_SIGNALS.cta);
  const monetizationHits = countPhraseMatches(fullText, PROMO_SIGNALS.monetization);
  const ctaDensity = ctaHits / Math.max(1, videoMinutes);

  let promoLevel: 'none' | 'soft' | 'moderate' | 'strong' = 'none';
  if (ctaDensity > 0.8 || monetizationHits > 5) promoLevel = 'strong';
  else if (ctaDensity > 0.3 || monetizationHits > 2) promoLevel = 'moderate';
  else if (ctaDensity > 0.1 || monetizationHits > 0) promoLevel = 'soft';

  // B: Platform-Heavy Detection
  const toolAnalysis = countToolMentions(fullText);
  const isPlatformHeavy = toolAnalysis.total > 15;
  const dominantTools = Object.entries(toolAnalysis.breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tool]) => tool);

  // C: Hard-Sell Detection (segment analysis)
  const segmentAnalysis = analyzeSegments(transcript, videoDurationSec);
  const avgDensity = segmentAnalysis.segmentDensities.reduce((a, b) => a + b, 0) / 4;
  const isHardSell = segmentAnalysis.lastQuarterDensity > avgDensity * 2 &&
                     segmentAnalysis.lastQuarterDensity > 1.5;

  // D: Teaching vs Tool-Demo
  const teachingRatio = analyzeTeachingRatio(fullText);
  const isToolDemo = teachingRatio < 0.3;

  // Calculate total penalty
  let totalPenalty = 0;
  if (promoLevel === 'strong') totalPenalty += 20;
  else if (promoLevel === 'moderate') totalPenalty += 10;
  else if (promoLevel === 'soft') totalPenalty += 3;

  if (isHardSell) totalPenalty += 15;
  if (isToolDemo && isPlatformHeavy) totalPenalty += 10;
  if (isPlatformHeavy && promoLevel !== 'none') totalPenalty += 5;

  // Determine verdict
  let verdict: 'reject' | 'allow_with_warning' | 'allow_tagged' | 'ideal';
  let verdictReason: string;

  if (promoLevel === 'strong' && teachingRatio < 0.4) {
    verdict = 'reject';
    verdictReason = 'High promo + low teaching value';
  } else if (promoLevel === 'strong' && teachingRatio >= 0.4) {
    verdict = 'allow_with_warning';
    verdictReason = 'High promo but good teaching - trim marketing segments';
  } else if (isPlatformHeavy && promoLevel === 'none') {
    verdict = 'allow_tagged';
    verdictReason = 'Tool-based tutorial with minimal promo';
  } else if (promoLevel === 'moderate') {
    verdict = 'allow_with_warning';
    verdictReason = 'Moderate promotional signals';
  } else {
    verdict = 'ideal';
    verdictReason = 'Educational content with minimal commercial signals';
  }

  // Generate recommended segments (skip high-promo sections)
  const recommendedSegments: { start: number; end: number; type: 'learn' | 'skip' }[] = [];
  const quarterDuration = videoDurationSec / 4;

  for (let i = 0; i < 4; i++) {
    const density = segmentAnalysis.segmentDensities[i] || 0;
    recommendedSegments.push({
      start: Math.floor(i * quarterDuration),
      end: Math.floor((i + 1) * quarterDuration),
      type: density > 1.5 ? 'skip' : 'learn',
    });
  }

  return {
    verdict,
    verdictReason,
    ctaHits,
    ctaDensity,
    monetizationHits,
    promoLevel,
    toolMentions: toolAnalysis.total,
    isPlatformHeavy,
    dominantTools,
    lastQuarterPromoDensity: segmentAnalysis.lastQuarterDensity,
    isHardSell,
    teachingRatio,
    isToolDemo,
    recommendedSegments,
    totalPenalty,
  };
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
