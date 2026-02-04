/**
 * Secure token generation and management for password reset and email verification
 */

export interface TokenData {
  userId: string;
  email: string;
  type: 'reset' | 'verify';
  createdAt: number;
  ipHash: string;
  userAgent: string;
}

/**
 * Generate a cryptographically secure random token (32 bytes = 256-bit entropy)
 * @returns Hex-encoded token string
 */
export function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash an IP address for privacy-safe audit logging
 */
export async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8) // Only store first 8 bytes for audit (16 hex chars)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Store a token in KV with automatic expiration
 */
export async function storeToken(
  kv: KVNamespace,
  token: string,
  data: TokenData,
  ttlSeconds: number
): Promise<void> {
  await kv.put(token, JSON.stringify(data), { expirationTtl: ttlSeconds });
}

/**
 * Retrieve and validate a token from KV
 * @returns Token data if valid, null if not found or invalid
 */
export async function getToken(
  kv: KVNamespace,
  token: string
): Promise<TokenData | null> {
  const data = await kv.get(token, 'json');
  if (!data) return null;
  return data as TokenData;
}

/**
 * Delete a token from KV (single-use enforcement)
 */
export async function deleteToken(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(token);
}

/**
 * Invalidate all tokens for a user by storing a prefix-based marker
 * Note: KV doesn't support prefix deletion, so we track invalidation time
 */
export async function invalidateUserTokens(
  kv: KVNamespace,
  userId: string,
  type: 'reset' | 'verify'
): Promise<void> {
  const key = `invalidated:${type}:${userId}`;
  const timestamp = Math.floor(Date.now() / 1000);
  await kv.put(key, timestamp.toString(), { expirationTtl: 86400 * 7 }); // 7 days
}

/**
 * Check if a token was created before invalidation
 */
export async function isTokenInvalidated(
  kv: KVNamespace,
  userId: string,
  type: 'reset' | 'verify',
  tokenCreatedAt: number
): Promise<boolean> {
  const key = `invalidated:${type}:${userId}`;
  const invalidatedAt = await kv.get(key, 'text');
  if (!invalidatedAt) return false;
  return tokenCreatedAt < parseInt(invalidatedAt, 10);
}

// Token TTLs
export const TOKEN_TTL = {
  PASSWORD_RESET: 3600, // 1 hour
  EMAIL_VERIFY: 86400, // 24 hours
} as const;
