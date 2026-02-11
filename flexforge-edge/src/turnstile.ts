/**
 * Cloudflare Turnstile verification helper
 * Validates CAPTCHA tokens against the Turnstile siteverify API
 */

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export async function verifyTurnstile(
  token: string,
  ip: string,
  secret: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip,
        }),
      },
    );

    const result = await response.json<TurnstileResponse>();

    if (!result.success) {
      console.warn('Turnstile verification failed:', result['error-codes']);
    }

    return result.success;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}
