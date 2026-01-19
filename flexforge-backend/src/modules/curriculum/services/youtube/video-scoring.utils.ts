/**
 * Video Scoring Utilities
 * Standalone scoring functions used by VideoMatchingService and tests
 */

import {
  CONTENT_SIGNALS,
  getChannelPolicy,
} from './youtube-policy';
import { extractConceptWords } from '../../utils/shared.utils';

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

  // Self-promo phrases in description (excluding duplicates from monetization)
  selfPromo: [
    'join', 'my course', 'bootcamp', 'cohort', 'community',
    'mentorship', 'patreon',
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

  // Brands that often create promotional tutorials (excluding those already in platformTools)
  promoBrands: [
    'jasper', 'semrush', 'salesforce', 'shopify', 'wix', 'squarespace',
    'wordpress', 'twilio', 'sendgrid', 'intercom', 'zendesk', 'freshdesk',
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
  // Content verification (concept + platform) is handled by Layer 3 Gemini AI
}

// ConceptMatchResult removed - scoreConceptMatch now returns number directly
// Content verification is handled by Layer 3 Gemini AI

// ============================================
// SCORING WEIGHTS
// ============================================

export const SCORING_WEIGHTS = {
  beginner: {
    conceptMatch: 0.28,      // +0.03: prioritize learning fit
    channelTrust: 0.25,
    durationFit: 0.10,
    cognitiveLoad: 0.12,     // +0.02: beginners need appropriate difficulty
    engagement: 0.05,        // -0.05: popularity ≠ pedagogy
    segmentability: 0.20,
  },
  intermediate: {
    conceptMatch: 0.32,      // +0.02
    channelTrust: 0.15,
    durationFit: 0.10,
    cognitiveLoad: 0.12,     // +0.02
    engagement: 0.06,        // -0.04
    segmentability: 0.25,
  },
  advanced: {
    conceptMatch: 0.37,      // +0.02
    channelTrust: 0.10,
    durationFit: 0.10,
    cognitiveLoad: 0.13,     // +0.03: depth matters more
    engagement: 0.08,        // -0.02: advanced learners tolerate some promo
    segmentability: 0.22,    // -0.03
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
// ADAPTIVE MODALITY - VIDEO VS AI DECISION
// ============================================

export type ContentMode = 'video' | 'ai' | 'both';

export interface AdaptiveModalityResult {
  /** Recommended default content mode */
  defaultMode: ContentMode;
  /** Confidence in video quality (0-100) */
  videoConfidence: number;
  /** Why this mode was recommended */
  reason: string;
  /** Short UI-friendly reason */
  reasonShort: string;
  /** Is video available (even if not default) */
  videoAvailable: boolean;
  /** Is AI explanation available */
  aiAvailable: boolean;
  /** Should show "prefer AI" toggle in UI */
  showAiOption: boolean;
  /** Should show "try video anyway" option */
  showVideoOption: boolean;
}

/**
 * Compute video confidence score (0-100) using multiple signals.
 * Higher = more confident this video will provide good learning experience.
 *
 * Factors:
 * - Concept match: Does video actually teach the topic?
 * - Marketing penalty: Is it promotional content?
 * - Promo analysis verdict: Deep promotional analysis
 * - Duration fit: Is length appropriate?
 * - Segmentability: Can we extract good segments?
 */
export function computeVideoConfidence(
  scores: {
    conceptMatch: number;
    marketingPenalty: number;
    durationFit: number;
    segmentability: number;
    channelTrust: number;
  },
  promoVerdict?: 'reject' | 'allow_with_warning' | 'allow_tagged' | 'ideal',
): number {
  // Base confidence from concept match (most important)
  let confidence = scores.conceptMatch * 0.6;

  // Marketing penalty reduces confidence significantly
  // marketingPenalty is 0-50, convert to confidence penalty
  const marketingImpact = Math.min(30, scores.marketingPenalty * 0.6);
  confidence -= marketingImpact;

  // Segmentability adds confidence (can we watch the right parts?)
  confidence += scores.segmentability * 0.1;

  // Channel trust adds confidence
  confidence += scores.channelTrust * 0.1;

  // Promo verdict adjustments
  if (promoVerdict === 'reject') {
    confidence -= 25;
  } else if (promoVerdict === 'allow_with_warning') {
    confidence -= 10;
  } else if (promoVerdict === 'ideal') {
    confidence += 5;
  }

  return Math.max(0, Math.min(100, Math.round(confidence)));
}

/**
 * Determine adaptive modality - should we show video, AI, or both?
 *
 * Decision logic (prefers AI reading slightly):
 * - High confidence (75+): Video as default, AI as backup
 * - Medium confidence (60-75): Both options, video default
 * - Low confidence (35-60): Both options, AI default
 * - Very low (<35): AI only, video hidden unless requested
 */
export function determineAdaptiveModality(
  videoConfidence: number,
  hasVideo: boolean,
  promoVerdict?: 'reject' | 'allow_with_warning' | 'allow_tagged' | 'ideal',
  marketingPenalty?: number,
): AdaptiveModalityResult {
  // No video found at all
  if (!hasVideo) {
    return {
      defaultMode: 'ai',
      videoConfidence: 0,
      reason: 'No suitable video found for this topic. AI explanation will help you understand the concepts.',
      reasonShort: 'No video match',
      videoAvailable: false,
      aiAvailable: true,
      showAiOption: false,  // AI is the only option
      showVideoOption: false,
    };
  }

  // Rejected by promotional analysis
  if (promoVerdict === 'reject') {
    return {
      defaultMode: 'ai',
      videoConfidence,
      reason: 'Available videos are too promotional. AI explanation focuses on teaching without sales pitches.',
      reasonShort: 'Videos too promotional',
      videoAvailable: true,
      aiAvailable: true,
      showAiOption: false,
      showVideoOption: true,  // Let user try anyway if curious
    };
  }

  // High confidence - video is great
  if (videoConfidence >= 75) {
    return {
      defaultMode: 'video',
      videoConfidence,
      reason: 'Found a high-quality video that matches this topic well.',
      reasonShort: 'Great video match',
      videoAvailable: true,
      aiAvailable: true,
      showAiOption: true,  // User can switch to AI if they prefer reading
      showVideoOption: false,
    };
  }

  // Medium-high confidence - video is good
  if (videoConfidence >= 60) {
    const hasWarning = promoVerdict === 'allow_with_warning' || (marketingPenalty && marketingPenalty > 10);
    return {
      defaultMode: 'video',
      videoConfidence,
      reason: hasWarning
        ? 'Found a relevant video. Contains some promotional content but has good teaching value.'
        : 'Found a relevant video that covers this topic.',
      reasonShort: hasWarning ? 'Good with some promo' : 'Good video match',
      videoAvailable: true,
      aiAvailable: true,
      showAiOption: true,
      showVideoOption: false,
    };
  }

  // Low-medium confidence - AI preferred but video available
  if (videoConfidence >= 35) {
    return {
      defaultMode: 'ai',
      videoConfidence,
      reason: 'AI explanation recommended for this topic. A video is available but may not be the best fit.',
      reasonShort: 'AI recommended',
      videoAvailable: true,
      aiAvailable: true,
      showAiOption: false,
      showVideoOption: true,
    };
  }

  // Very low confidence - AI strongly preferred
  return {
    defaultMode: 'ai',
    videoConfidence,
    reason: 'AI explanation is better for this topic. Available videos don\'t closely match what you need to learn.',
    reasonShort: 'AI is better here',
    videoAvailable: true,
    aiAvailable: true,
    showAiOption: false,
    showVideoOption: true,
  };
}

// ============================================
// CONCEPT SYNONYMS - Generated dynamically
// ============================================

// Common abbreviations (bidirectional: full <-> short)
const ABBREVIATIONS: Record<string, string> = {
  // Languages
  javascript: 'js', typescript: 'ts', python: 'py', golang: 'go',
  // Infra & databases
  kubernetes: 'k8s', database: 'db', postgresql: 'postgres', mongodb: 'mongo',
  elasticsearch: 'es', dynamodb: 'dynamo', redis: 'rd',
  // AI/ML
  'artificial intelligence': 'ai', 'machine learning': 'ml',
  'large language model': 'llm', 'generative pre-trained': 'gpt',
  'natural language processing': 'nlp', 'computer vision': 'cv',
  'retrieval augmented generation': 'rag', 'neural network': 'nn',
  // Cloud & DevOps
  'amazon web services': 'aws', 'google cloud': 'gcp', 'microsoft azure': 'azure',
  'continuous integration': 'ci', 'continuous deployment': 'cd',
  'infrastructure as code': 'iac', serverless: 'sls',
  // Web & API
  'user interface': 'ui', 'user experience': 'ux',
  'application programming interface': 'api', 'rest api': 'restful',
  'graphql': 'gql', 'software development kit': 'sdk',
  // Auth & security
  application: 'app', authentication: 'auth', authorization: 'authz',
  'json web token': 'jwt', 'single sign-on': 'sso', 'two-factor': '2fa',
  // Frontend
  'cascading style sheets': 'css', 'hypertext markup': 'html',
  'document object model': 'dom', 'server side rendering': 'ssr',
  'static site generation': 'ssg', 'single page application': 'spa',
  // Data formats
  'javascript object notation': 'json', 'extensible markup': 'xml',
  // Testing & quality
  'test driven development': 'tdd', 'behavior driven': 'bdd',
  'quality assurance': 'qa', 'end to end': 'e2e',
  // Tools & environments
  'command line interface': 'cli', 'integrated development environment': 'ide',
  'version control system': 'vcs', repository: 'repo', configuration: 'config',
  environment: 'env', development: 'dev', production: 'prod',
};

/**
 * Generate verb/noun stem variations (automate <-> automation, deploy <-> deployment, etc.)
 */
function getStemVariations(word: string): string[] {
  const variations: string[] = [];
  const lower = word.toLowerCase();

  // -ation/-tion suffix (automation -> automate, integration -> integrate)
  if (lower.endsWith('ation')) {
    const base = lower.slice(0, -5); // remove 'ation'
    variations.push(base + 'e', base); // automate, integrat -> integrate
  } else if (lower.endsWith('tion')) {
    const base = lower.slice(0, -4);
    variations.push(base + 'e', base);
  }
  // -ment suffix (deployment -> deploy)
  else if (lower.endsWith('ment')) {
    variations.push(lower.slice(0, -4));
  }
  // -ing suffix (testing -> test)
  else if (lower.endsWith('ing') && lower.length > 4) {
    const base = lower.slice(0, -3);
    variations.push(base, base.slice(0, -1)); // testing -> test, building -> build
  }
  // Verb forms: try adding common suffixes
  else if (lower.length >= 4) {
    if (lower.endsWith('e')) {
      variations.push(lower.slice(0, -1) + 'ation', lower.slice(0, -1) + 'ing');
    } else {
      variations.push(lower + 'ation', lower + 'ment', lower + 'ing');
    }
  }

  return variations;
}

/**
 * Generate variations of a word (framework.js patterns, abbreviations, plurals, stems)
 */
function getWordVariations(word: string): string[] {
  const variations = [word];
  const lower = word.toLowerCase();

  // Framework patterns: react -> reactjs, react.js
  if (/^[a-z]+$/.test(lower) && lower.length >= 3) {
    variations.push(lower + 'js', lower + '.js');
  }

  // Abbreviations (both directions)
  if (ABBREVIATIONS[lower]) {
    variations.push(ABBREVIATIONS[lower]);
  }
  const fullForm = Object.entries(ABBREVIATIONS).find(([, abbr]) => abbr === lower)?.[0];
  if (fullForm) variations.push(fullForm);

  // Plurals
  if (!lower.endsWith('s')) variations.push(lower + 's');

  // Verb/noun stem variations
  variations.push(...getStemVariations(lower));

  return variations;
}

/**
 * Check if text contains any variation of the word
 */
export function textContainsWord(text: string, word: string): boolean {
  const variations = getWordVariations(word);
  return variations.some(v => text.includes(v));
}

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

// ============================================
// COMPREHENSIVE PROMOTIONAL ANALYSIS
// ============================================

/**
 * Check if a topic inherently involves tools/platforms.
 * Returns true if the concept contains any platform tools from our detection list,
 * or contains words indicating tool/integration usage patterns.
 * When true, tool mentions in videos are expected and shouldn't be penalized.
 */
export function isToolRelatedTopic(concept: string): boolean {
  const conceptLower = concept.toLowerCase();
  // Check if concept mentions any specific tools
  if (PROMO_SIGNALS.platformTools.some(tool => conceptLower.includes(tool.toLowerCase()))) {
    return true;
  }
  // Check for generic tool-usage patterns via stems
  const toolPatterns = ['api', 'automat', 'integrat', 'workflow', 'pipeline', 'webhook', 'endpoint'];
  return toolPatterns.some(pattern => conceptLower.includes(pattern));
}

// ============================================
// VIDEO CONTENT TYPE CLASSIFICATION
// ============================================

export type VideoContentType = 'CONCEPT' | 'TOOL_SPECIFIC' | 'MIXED';

export interface ContentTypeResult {
  type: VideoContentType;
  toolsMentioned: string[];
  reason: string;
}

/**
 * Classify video as CONCEPT (teaches principles) vs TOOL_SPECIFIC (teaches a specific tool).
 * CONCEPT videos are preferred for learning, TOOL_SPECIFIC offered as optional "see it in action".
 *
 * @param title - Video title
 * @param concept - Search concept to check if tool is explicitly requested
 * @returns Classification with detected tools
 */
export function classifyVideoContentType(
  title: string,
  concept: string,
): ContentTypeResult {
  const titleLower = title.toLowerCase();
  const conceptLower = concept.toLowerCase();

  // Check which platform tools appear in the title
  const toolsInTitle = PROMO_SIGNALS.platformTools.filter(tool =>
    titleLower.includes(tool.toLowerCase()),
  );

  // Check if concept explicitly mentions these tools (user wants tool-specific content)
  const toolsRequestedInConcept = toolsInTitle.filter(tool =>
    conceptLower.includes(tool.toLowerCase()),
  );

  // Strong tool-specific signals in title
  const toolSpecificPatterns = [
    /\b(using|with|in|for)\s+(zapier|make|n8n|airtable|notion|retool|bubble)/i,
    /\b(zapier|make|n8n|airtable|notion)\s+(tutorial|guide|course|beginner)/i,
    /\bhow to\b.*\b(zapier|make|n8n|airtable|notion)\b/i,
  ];
  const hasToolSpecificPattern = toolSpecificPatterns.some(p => p.test(title));

  // If tools in title but NOT in concept = video is too specific for this search
  if (toolsInTitle.length > 0 && toolsRequestedInConcept.length === 0) {
    if (hasToolSpecificPattern || toolsInTitle.length >= 1) {
      return {
        type: 'TOOL_SPECIFIC',
        toolsMentioned: toolsInTitle,
        reason: `Video focuses on ${toolsInTitle.join(', ')} but concept doesn't mention these tools`,
      };
    }
  }

  // If concept mentions the tool, tool-specific is acceptable
  if (toolsInTitle.length > 0 && toolsRequestedInConcept.length > 0) {
    return {
      type: 'MIXED',
      toolsMentioned: toolsInTitle,
      reason: `Tool-specific but matches concept request for ${toolsRequestedInConcept.join(', ')}`,
    };
  }

  // No specific tools = concept-focused
  return {
    type: 'CONCEPT',
    toolsMentioned: [],
    reason: 'Tool-agnostic, teaches general principles',
  };
}

/**
 * Calculate penalty for tool-specific videos based on user's platform tolerance.
 * KEY for solving the "Zapier problem" - prevents tool-specific content from
 * dominating results when user wants vendor-neutral learning.
 *
 * @param contentType - Result from classifyVideoContentType
 * @param platformTolerance - User's preference (from learnerPrefs)
 * @returns Penalty points to subtract from video score (0-35)
 */
export function getPlatformTolerancePenalty(
  contentType: ContentTypeResult,
  platformTolerance: 'any' | 'preferGeneric' | 'genericOnly' = 'preferGeneric',
): number {
  // No penalty for concept-focused content
  if (contentType.type === 'CONCEPT') {
    return 0;
  }

  // Mixed content (user asked for tool) gets minimal penalty
  if (contentType.type === 'MIXED') {
    return platformTolerance === 'genericOnly' ? 10 : 0;
  }

  // TOOL_SPECIFIC content penalty based on user tolerance
  const penalties = {
    any: 0, // User is fine with tool-specific content
    preferGeneric: 15, // Moderate penalty - prefer concept but tools okay
    genericOnly: 35, // Heavy penalty - strongly prefer vendor-neutral
  };

  return penalties[platformTolerance];
}

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
 * @param concept - Optional topic to check if tools are expected (e.g., automation topics)
 */
export function analyzePromoContent(
  transcript: Array<{ text: string; start: number }>,
  videoDurationSec: number,
  concept?: string,
): PromoAnalysisResult {
  const fullText = transcript.map(t => t.text).join(' ');
  const videoMinutes = videoDurationSec / 60;
  const toolsExpected = concept ? isToolRelatedTopic(concept) : false;

  // A: CTA & Funnel Detection using shared signals
  const ctaHits = countPhraseMatches(fullText, PROMO_SIGNALS.cta);
  const monetizationHits = countPhraseMatches(fullText, PROMO_SIGNALS.monetization);
  const ctaDensity = ctaHits / Math.max(1, videoMinutes);

  let promoLevel: 'none' | 'soft' | 'moderate' | 'strong' = 'none';
  if (ctaDensity > 0.8 || monetizationHits > 5) promoLevel = 'strong';
  else if (ctaDensity > 0.3 || monetizationHits > 2) promoLevel = 'moderate';
  else if (ctaDensity > 0.1 || monetizationHits > 0) promoLevel = 'soft';

  // B: Platform-Heavy Detection
  // If tools are expected for this topic, raise threshold significantly
  const toolAnalysis = countToolMentions(fullText);
  const platformThreshold = toolsExpected ? 50 : 15;
  const isPlatformHeavy = toolAnalysis.total > platformThreshold;
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
  // For tool-related topics, being a "tool demo" is expected and not penalized
  const teachingRatio = analyzeTeachingRatio(fullText);
  const isToolDemo = teachingRatio < 0.3 && !toolsExpected;

  // Calculate total penalty
  let totalPenalty = 0;
  if (promoLevel === 'strong') totalPenalty += 20;
  else if (promoLevel === 'moderate') totalPenalty += 10;
  else if (promoLevel === 'soft') totalPenalty += 3;

  if (isHardSell) totalPenalty += 15;
  if (isToolDemo && isPlatformHeavy) totalPenalty += 10;
  if (isPlatformHeavy && promoLevel !== 'none' && !toolsExpected) totalPenalty += 5;

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
    verdict = toolsExpected ? 'ideal' : 'allow_tagged';
    verdictReason = toolsExpected
      ? 'Tool-focused content matching topic'
      : 'Tool-based tutorial with minimal promo';
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
 *
 * Uses word coverage ratio to penalize videos that only match some concept words.
 * e.g., searching "AI API" but video only has "API" = low coverage = penalty
 *
 * Also handles curriculum-driven requirements:
 * - mustCover: bonus for covering required concepts
 * Content verification (concept + platform) is handled by Layer 3 Gemini AI
 */
export function scoreConceptMatch(video: ScoringVideo, context: ScoringContext): number {
  let score = 50;
  const titleLower = video.title.toLowerCase();
  const descLower = video.description.toLowerCase();
  const combined = `${titleLower} ${descLower}`;
  const conceptLower = context.concept.toLowerCase();

  // Exact concept in title: +30
  if (titleLower.includes(conceptLower)) {
    score += 30;
  }

  // Concept words analysis with coverage tracking
  const conceptWords = extractConceptWords(context.concept);
  let wordsFoundInTitle = 0;

  for (const word of conceptWords) {
    if (textContainsWord(titleLower, word)) {
      score += 10;
      wordsFoundInTitle++;
    }
  }

  // Word coverage penalty/bonus for multi-word concepts
  // Scale threshold based on concept complexity - compound topics are harder to match
  if (conceptWords.length >= 2) {
    const coverageRatio = wordsFoundInTitle / conceptWords.length;
    // Minimum required coverage scales down for longer concepts
    // 2 words: 50%, 3 words: 33%, 4+ words: 25%
    const minCoverage = Math.max(0.25, 1 / conceptWords.length);

    if (coverageRatio >= 0.75) {
      score += 10;
    } else if (coverageRatio >= 0.5) {
      score += 5;
    } else if (coverageRatio < minCoverage) {
      // Only penalize if below minimum threshold
      score -= 10;
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
      conceptWords.some(word => textContainsWord(ch.title.toLowerCase(), word)),
    );
    if (chapterContainsConcept) {
      score += 12;
    }
  }

  // Content verification is handled by Layer 3 Gemini AI
  // (removed keyword-based scoring - AI verifies actual content)

  return Math.max(20, Math.min(100, score));
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

