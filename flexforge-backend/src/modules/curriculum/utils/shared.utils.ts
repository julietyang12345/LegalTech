/**
 * Shared utilities for curriculum module
 * Consolidates common functions to avoid duplication
 */

// ============================================
// JSON PARSING
// ============================================

/**
 * Parse JSON from AI response with automatic cleanup.
 * Handles code fences, trailing commas, and extracts JSON from text.
 */
export function parseAiJson<T = any>(text: string): T {
  // Remove code fences
  let cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  // Extract JSON object if surrounded by text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try fixing trailing commas
    const fixed = cleaned.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(fixed);
  }
}

/**
 * Safely parse JSON with a fallback value
 */
export function parseAiJsonSafe<T>(text: string, fallback: T): T {
  try {
    return parseAiJson<T>(text);
  } catch {
    return fallback;
  }
}

// ============================================
// TIME FORMATTING
// ============================================

/**
 * Convert seconds to MM:SS format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse duration string (e.g., "5:30" or "1:23:45") to seconds
 */
export function parseDurationString(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// ============================================
// TEXT PROCESSING
// ============================================

/**
 * Stopwords that don't carry meaning for video matching.
 */
const CONCEPT_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
]);

/**
 * Extract concept words from a search query.
 * Filters out single-letter words and common stopwords.
 */
export function extractConceptWords(concept: string): string[] {
  return concept
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 1 && !CONCEPT_STOPWORDS.has(w));
}

/**
 * Clean a search query by removing common prefixes
 */
export function cleanSearchQuery(query: string): string {
  return query
    .replace(/^(What is|What are|How to|Why|When to use)\s*/i, '')
    .replace(/\?$/, '')
    .trim();
}

// ============================================
// LRU CACHE
// ============================================

/**
 * Generic LRU (Least Recently Used) cache with TTL support
 */
export class LRUCache<T> {
  private cache = new Map<
    string,
    { value: T; cachedAt: number; failed?: boolean }
  >();
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly negativeTtl: number;

  constructor(
    options: {
      maxSize?: number;
      ttl?: number; // TTL for successful entries (ms)
      negativeTtl?: number; // TTL for failed entries (ms)
    } = {},
  ) {
    this.maxSize = options.maxSize ?? 500;
    this.ttl = options.ttl ?? 7 * 24 * 60 * 60 * 1000; // 7 days default
    this.negativeTtl = options.negativeTtl ?? 15 * 60 * 1000; // 15 min default
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const ttl = entry.failed ? this.negativeTtl : this.ttl;
    if (Date.now() - entry.cachedAt > ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, failed = false): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { value, cachedAt: Date.now(), failed });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
