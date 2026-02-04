/**
 * Multi-layer rate limiting for email-related endpoints
 * Uses Cloudflare KV with auto-expiring counters
 */

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

interface RateLimitConfig {
  perEmail: { limit: number; windowSeconds: number };
  perIp: { limit: number; windowSeconds: number };
  global: { limit: number; windowSeconds: number };
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  perEmail: { limit: 3, windowSeconds: 3600 }, // 3 requests per email per hour
  perIp: { limit: 10, windowSeconds: 3600 }, // 10 requests per IP per hour
  global: { limit: 100, windowSeconds: 60 }, // 100 requests globally per minute (circuit breaker)
};

/**
 * Hash a value for privacy-safe storage (IP addresses, etc.)
 */
async function hashValue(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Increment a rate limit counter and check if limit exceeded
 */
async function incrementCounter(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ count: number; exceeded: boolean }> {
  const existing = await kv.get(key, 'text');
  const currentCount = existing ? parseInt(existing, 10) : 0;
  const newCount = currentCount + 1;

  // Store with TTL for automatic expiry
  await kv.put(key, newCount.toString(), { expirationTtl: windowSeconds });

  return {
    count: newCount,
    exceeded: newCount > limit,
  };
}

/**
 * Check rate limits for an email operation
 * Checks three layers: per-email, per-IP, and global
 *
 * @param email - Email address being requested
 * @param ip - Client IP address
 * @param kv - KV namespace for rate limit storage
 * @param action - Action identifier (e.g., 'password-reset', 'email-verify')
 * @param config - Optional custom rate limit configuration
 */
export async function checkRateLimit(
  email: string,
  ip: string,
  kv: KVNamespace,
  action: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const emailHash = await hashValue(email.toLowerCase());
  const ipHash = await hashValue(ip);

  // Keys for different rate limit layers
  const emailKey = `ratelimit:${action}:email:${emailHash}`;
  const ipKey = `ratelimit:${action}:ip:${ipHash}`;
  const globalKey = `ratelimit:${action}:global`;

  // Check global rate limit first (circuit breaker)
  const globalResult = await incrementCounter(
    kv,
    globalKey,
    config.global.limit,
    config.global.windowSeconds
  );
  if (globalResult.exceeded) {
    console.warn(`Global rate limit exceeded for ${action}: ${globalResult.count}/${config.global.limit}`);
    return {
      allowed: false,
      reason: 'Service is experiencing high demand. Please try again later.',
      retryAfterSeconds: config.global.windowSeconds,
    };
  }

  // Check per-email rate limit
  const emailResult = await incrementCounter(
    kv,
    emailKey,
    config.perEmail.limit,
    config.perEmail.windowSeconds
  );
  if (emailResult.exceeded) {
    return {
      allowed: false,
      reason: 'Too many requests for this email. Please try again later.',
      retryAfterSeconds: config.perEmail.windowSeconds,
    };
  }

  // Check per-IP rate limit
  const ipResult = await incrementCounter(
    kv,
    ipKey,
    config.perIp.limit,
    config.perIp.windowSeconds
  );
  if (ipResult.exceeded) {
    return {
      allowed: false,
      reason: 'Too many requests from your location. Please try again later.',
      retryAfterSeconds: config.perIp.windowSeconds,
    };
  }

  return { allowed: true };
}

/**
 * Reset rate limit for a specific email (used after successful verification)
 */
export async function resetRateLimit(
  email: string,
  kv: KVNamespace,
  action: string
): Promise<void> {
  const emailHash = await hashValue(email.toLowerCase());
  const emailKey = `ratelimit:${action}:email:${emailHash}`;
  await kv.delete(emailKey);
}
