/**
 * HMAC signing for edge->backend trust
 * Ensures backend only accepts requests that were validated by the edge worker
 */

interface SignedPayload {
  userId: string;
  action: string;
  timestamp: number;
  [key: string]: unknown;
}

/**
 * Sign a payload with HMAC-SHA256
 * @param payload - Data to sign (must include userId, action, timestamp)
 * @param secret - Shared secret between edge and backend
 * @returns Base64-encoded HMAC signature
 */
export async function signRequest(
  payload: SignedPayload,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();

  // Create deterministic string from payload
  const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(sortedPayload)
  );

  // Convert to base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify an HMAC signature
 * @param payload - Original payload that was signed
 * @param signature - Base64-encoded signature to verify
 * @param secret - Shared secret
 * @returns True if signature is valid
 */
export async function verifySignature(
  payload: SignedPayload,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();

  // Create deterministic string from payload
  const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Decode base64 signature
  const signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));

  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(sortedPayload)
  );
}

/**
 * Create signed headers for backend request
 * @param userId - User ID from token validation
 * @param action - Action being performed (e.g., 'reset-password', 'verify-email')
 * @param secret - Shared secret
 * @param additionalData - Optional additional data to include in signature
 * @returns Headers object with signature information
 */
export async function createSignedHeaders(
  userId: string,
  action: string,
  secret: string,
  additionalData?: Record<string, unknown>
): Promise<{ signature: string; timestamp: number; payload: SignedPayload }> {
  const timestamp = Math.floor(Date.now() / 1000);

  const payload: SignedPayload = {
    userId,
    action,
    timestamp,
    ...additionalData,
  };

  const signature = await signRequest(payload, secret);

  return {
    signature,
    timestamp,
    payload,
  };
}

/**
 * Validate timestamp is within acceptable window
 * @param timestamp - Unix timestamp to validate
 * @param maxAgeSeconds - Maximum allowed age in seconds (default: 5 minutes)
 * @returns True if timestamp is valid (not too old or in future)
 */
export function isTimestampValid(timestamp: number, maxAgeSeconds: number = 300): boolean {
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;

  // Reject if older than maxAgeSeconds or more than 60 seconds in the future
  return age >= -60 && age <= maxAgeSeconds;
}
