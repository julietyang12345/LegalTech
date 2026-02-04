import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { sendEmail } from './email';
import { passwordResetEmail, emailVerificationEmail } from './email-templates';
import { checkRateLimit } from './rate-limit';
import { createSignedHeaders } from './signing';
import {
  generateSecureToken,
  hashIp,
  storeToken,
  getToken,
  deleteToken,
  invalidateUserTokens,
  isTokenInvalidated,
  TOKEN_TTL,
  type TokenData,
} from './tokens';

// Type definitions for Cloudflare bindings
type Bindings = {
  VIDEO_CACHE: KVNamespace;
  TRANSCRIPT_CACHE: KVNamespace;
  DOC_CACHE: KVNamespace;
  PASSWORD_RESET_TOKENS: KVNamespace;
  EMAIL_VERIFY_TOKENS: KVNamespace;
  RATE_LIMIT_COUNTERS: KVNamespace;
  BACKEND_URL: string;
  FRONTEND_URL: string;
  FROM_EMAIL: string;
  FROM_NAME: string;
  JWT_SECRET: string;
  EDGE_SIGNING_SECRET: string;
  DKIM_PRIVATE_KEY?: string;
  // Cloudflare Access Service Token for backend authentication
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
};

// JWT payload type matching backend
type JwtPayload = {
  email: string;
  sub: string; // userId
  role: 'MEMBER' | 'ADMIN';
  iat: number;
  exp: number;
};

type Variables = {
  jwtPayload: JwtPayload;
};

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/health',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/logout',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/resend-verification',
  '/api/v1/auth/check-email-exists', // Internal endpoint for edge worker
];

// Check if route is public
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

// Helper to create backend request headers with Cloudflare Access auth
function createBackendHeaders(
  c: { env: Bindings; req: { header: (name: string) => string | undefined }; var?: Variables }
): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  // Add Cloudflare Access service token headers
  if (c.env.CF_ACCESS_CLIENT_ID && c.env.CF_ACCESS_CLIENT_SECRET) {
    headers.set('CF-Access-Client-Id', c.env.CF_ACCESS_CLIENT_ID);
    headers.set('CF-Access-Client-Secret', c.env.CF_ACCESS_CLIENT_SECRET);
  }

  // Forward user authorization if present
  const auth = c.req.header('Authorization');
  if (auth) {
    headers.set('Authorization', auth);
  }

  return headers;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS configuration
app.use(
  '*',
  cors({
    origin: [
      'https://flexforge.ai',
      'https://www.flexforge.ai',
      'https://app.flexforge.ai',
      'https://flexforge.app',
      'https://www.flexforge.app',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
  })
);

// Helper to parse cookies from Cookie header
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((cookie) => {
      const [key, ...rest] = cookie.trim().split('=');
      return [key, rest.join('=')];
    })
  );
}

// Authentication middleware
const authMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const pathname = new URL(c.req.url).pathname;

    // Skip auth for public routes
    if (isPublicRoute(pathname)) {
      await next();
      return;
    }

    // Try to get token from Authorization header first, then from cookie
    let token: string | null = null;

    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      // Fallback to HTTP-only cookie
      const cookies = parseCookies(c.req.header('Cookie'));
      token = cookies['access_token'] || null;
    }

    if (!token) {
      return c.json({ error: 'Unauthorized', message: 'Missing authentication token' }, 401);
    }

    try {
      // Verify JWT
      const payload = await verifyJwt(token, c.env.JWT_SECRET);
      c.set('jwtPayload', payload);
      await next();
    } catch (error) {
      console.error('JWT verification failed:', error);
      return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
    }
  }
);

// JWT verification using Web Crypto API (Cloudflare Workers compatible)
async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode payload
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  // Verify signature using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureData = Uint8Array.from(
    atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0)
  );

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify('HMAC', key, signatureData, data);

  if (!valid) {
    throw new Error('Invalid signature');
  }

  return payload as JwtPayload;
}

// Apply auth middleware
app.use('*', authMiddleware);

// Health check endpoint (public)
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'flexforge-edge', timestamp: new Date().toISOString() });
});

/**
 * POST /api/v1/auth/register
 * Intercept registration to send verification email after successful backend registration
 */
app.post('/api/v1/auth/register', async (c) => {
  try {
    // Clone the request body before proxying
    const body = await c.req.json<{ email: string; password: string; name?: string }>();
    const email = body.email?.toLowerCase()?.trim();

    // Proxy to backend
    const backendResponse = await fetch(`${c.env.BACKEND_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: createBackendHeaders(c),
      body: JSON.stringify(body),
    });

    // Forward response headers including Set-Cookie
    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        responseHeaders.set(key, value);
      }
    });

    // Handle Set-Cookie headers
    const anyHeaders = backendResponse.headers as any;
    const setCookies: string[] | undefined = anyHeaders.getSetCookie?.();
    if (setCookies && setCookies.length > 0) {
      for (const sc of setCookies) {
        responseHeaders.append('Set-Cookie', sc);
      }
    } else {
      const sc = backendResponse.headers.get('set-cookie');
      if (sc) responseHeaders.append('Set-Cookie', sc);
    }

    // If registration failed, return the error
    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      return new Response(errorData, {
        status: backendResponse.status,
        headers: responseHeaders,
      });
    }

    // Parse successful response to get user ID
    const responseData = await backendResponse.json<{ user?: { id: string; name?: string } }>();

    // Send verification email if we have a user ID
    if (responseData.user?.id && email) {
      const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
      const token = generateSecureToken();
      const ipHash = await hashIp(clientIp);

      const tokenData: TokenData = {
        userId: responseData.user.id,
        email,
        type: 'verify',
        createdAt: Math.floor(Date.now() / 1000),
        ipHash,
        userAgent: c.req.header('user-agent') || 'unknown',
      };

      // Store token with 24 hour TTL
      await storeToken(c.env.EMAIL_VERIFY_TOKENS, token, tokenData, TOKEN_TTL.EMAIL_VERIFY);

      // Build verify URL (token in fragment for security)
      const verifyUrl = `${c.env.FRONTEND_URL}/verify-email#token=${token}`;

      // Generate and send email
      const emailContent = emailVerificationEmail({
        verifyUrl,
        userName: responseData.user.name || body.name,
        expiresInHours: Math.floor(TOKEN_TTL.EMAIL_VERIFY / 3600),
      });

      // Fire and forget - don't block registration on email delivery
      sendEmail({
        to: { email, name: responseData.user.name || body.name },
        from: { email: c.env.FROM_EMAIL, name: c.env.FROM_NAME },
        subject: 'Verify Your FlexForge Email',
        html: emailContent.html,
        text: emailContent.text,
        dkimPrivateKey: c.env.DKIM_PRIVATE_KEY,
        dkimSelector: 'mailchannels',
        dkimDomain: 'flexforge.ai',
      }).catch((err) => console.error('Failed to send verification email:', err));

      // Modify response to indicate verification is required
      return c.json(
        {
          ...responseData,
          requiresVerification: true,
          message: 'Registration successful! Please check your email to verify your account.',
        },
        200,
        Object.fromEntries(responseHeaders.entries())
      );
    }

    // Return original response if no user ID
    return c.json(responseData, 200, Object.fromEntries(responseHeaders.entries()));
  } catch (error) {
    console.error('Registration intercept error:', error);
    // On error, proxy directly to backend
    const url = new URL(c.req.url);
    const backendUrl = `${c.env.BACKEND_URL}${url.pathname}${url.search}`;

    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: createBackendHeaders(c),
      body: c.req.raw.body,
    });

    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  }
});

// Video enrichment caching - cache at edge for 7 days
app.get('/api/v1/videos/:videoId/enrichment', async (c) => {
  const videoId = c.req.param('videoId');
  const cacheKey = `video:${videoId}:enrichment`;

  // Check KV cache first
  const cached = await c.env.VIDEO_CACHE.get(cacheKey, 'json');
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  // Proxy to backend with Cloudflare Access auth
  const backendUrl = `${c.env.BACKEND_URL}/api/v1/videos/${videoId}/enrichment`;
  const res = await fetch(backendUrl, {
    headers: createBackendHeaders(c),
  });

  if (res.ok) {
    const data = await res.json();
    // Cache for 7 days
    await c.env.VIDEO_CACHE.put(cacheKey, JSON.stringify(data), {
      expirationTtl: 60 * 60 * 24 * 7,
    });
    c.header('X-Cache', 'MISS');
    return c.json(data);
  }

  // Return backend error response
  const errorData = await res.text();
  return new Response(errorData, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Transcript caching - cache at edge for 1 day
app.get('/api/v1/videos/:videoId/transcript', async (c) => {
  const videoId = c.req.param('videoId');
  const cacheKey = `transcript:${videoId}`;

  // Check KV cache first
  const cached = await c.env.TRANSCRIPT_CACHE.get(cacheKey, 'json');
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  // Proxy to backend with Cloudflare Access auth
  const backendUrl = `${c.env.BACKEND_URL}/api/v1/videos/${videoId}/transcript`;
  const res = await fetch(backendUrl, {
    headers: createBackendHeaders(c),
  });

  if (res.ok) {
    const data = await res.json();
    // Cache for 1 day
    await c.env.TRANSCRIPT_CACHE.put(cacheKey, JSON.stringify(data), {
      expirationTtl: 60 * 60 * 24,
    });
    c.header('X-Cache', 'MISS');
    return c.json(data);
  }

  const errorData = await res.text();
  return new Response(errorData, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Documentation caching - cache at edge for 7 days
app.get('/api/v1/docs/:docId', async (c) => {
  const docId = c.req.param('docId');
  const cacheKey = `doc:${docId}`;

  // Check KV cache first
  const cached = await c.env.DOC_CACHE.get(cacheKey, 'json');
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  // Proxy to backend with Cloudflare Access auth
  const backendUrl = `${c.env.BACKEND_URL}/api/v1/docs/${docId}`;
  const res = await fetch(backendUrl, {
    headers: createBackendHeaders(c),
  });

  if (res.ok) {
    const data = await res.json();
    // Cache for 7 days
    await c.env.DOC_CACHE.put(cacheKey, JSON.stringify(data), {
      expirationTtl: 60 * 60 * 24 * 7,
    });
    c.header('X-Cache', 'MISS');
    return c.json(data);
  }

  const errorData = await res.text();
  return new Response(errorData, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Cache invalidation endpoint (for admin use)
app.delete('/api/v1/cache/video/:videoId', async (c) => {
  const videoId = c.req.param('videoId');

  // Delete from both video and transcript caches
  await Promise.all([
    c.env.VIDEO_CACHE.delete(`video:${videoId}:enrichment`),
    c.env.TRANSCRIPT_CACHE.delete(`transcript:${videoId}`),
  ]);

  return c.json({ success: true, message: `Cache cleared for video ${videoId}` });
});

// ============================================================================
// PASSWORD RESET & EMAIL VERIFICATION ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset email
 */
app.post('/api/v1/auth/forgot-password', async (c) => {
  try {
    const body = await c.req.json<{ email: string }>();
    const email = body.email?.toLowerCase()?.trim();

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // Get client IP for rate limiting
    const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';

    // Check rate limits
    const rateLimit = await checkRateLimit(
      email,
      clientIp,
      c.env.RATE_LIMIT_COUNTERS,
      'password-reset'
    );

    if (!rateLimit.allowed) {
      // Always return success to prevent email enumeration, but log the rate limit
      console.warn(`Rate limit exceeded for password reset: ${email}`);
      return c.json({
        message: 'If an account exists with this email, you will receive a password reset link.',
      });
    }

    // Check if email exists in backend
    const checkResponse = await fetch(`${c.env.BACKEND_URL}/api/v1/auth/check-email-exists`, {
      method: 'POST',
      headers: createBackendHeaders(c),
      body: JSON.stringify({ email }),
    });

    if (!checkResponse.ok) {
      // Don't reveal that the email doesn't exist
      return c.json({
        message: 'If an account exists with this email, you will receive a password reset link.',
      });
    }

    const checkData = await checkResponse.json<{ exists: boolean; userId?: string; name?: string }>();

    if (!checkData.exists || !checkData.userId) {
      // Don't reveal that the email doesn't exist
      return c.json({
        message: 'If an account exists with this email, you will receive a password reset link.',
      });
    }

    // Invalidate any existing tokens for this user
    await invalidateUserTokens(c.env.PASSWORD_RESET_TOKENS, checkData.userId, 'reset');

    // Generate secure token
    const token = generateSecureToken();
    const ipHash = await hashIp(clientIp);

    const tokenData: TokenData = {
      userId: checkData.userId,
      email,
      type: 'reset',
      createdAt: Math.floor(Date.now() / 1000),
      ipHash,
      userAgent: c.req.header('user-agent') || 'unknown',
    };

    // Store token with 1 hour TTL
    await storeToken(c.env.PASSWORD_RESET_TOKENS, token, tokenData, TOKEN_TTL.PASSWORD_RESET);

    // Build reset URL (token in query param, frontend will clean it)
    const resetUrl = `${c.env.FRONTEND_URL}/reset-password?token=${token}`;

    // Generate email content
    const emailContent = passwordResetEmail({
      resetUrl,
      userName: checkData.name,
      expiresInMinutes: Math.floor(TOKEN_TTL.PASSWORD_RESET / 60),
    });

    // Send email
    const emailResult = await sendEmail({
      to: { email, name: checkData.name },
      from: { email: c.env.FROM_EMAIL, name: c.env.FROM_NAME },
      subject: 'Reset Your FlexForge Password',
      html: emailContent.html,
      text: emailContent.text,
      dkimPrivateKey: c.env.DKIM_PRIVATE_KEY,
      dkimSelector: 'mailchannels',
      dkimDomain: 'flexforge.ai',
    });

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      // Still return success to prevent enumeration
    }

    return c.json({
      message: 'If an account exists with this email, you will receive a password reset link.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password using a valid token
 */
app.post('/api/v1/auth/reset-password', async (c) => {
  try {
    const body = await c.req.json<{ token: string; newPassword: string }>();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return c.json({ error: 'Token and new password are required' }, 400);
    }

    // Validate password (must match backend validation)
    if (newPassword.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }
    if (!/[A-Z]/.test(newPassword)) {
      return c.json({ error: 'Password must contain at least one uppercase letter' }, 400);
    }
    if (!/[a-z]/.test(newPassword)) {
      return c.json({ error: 'Password must contain at least one lowercase letter' }, 400);
    }
    if (!/\d/.test(newPassword)) {
      return c.json({ error: 'Password must contain at least one digit' }, 400);
    }

    // Look up token
    const tokenData = await getToken(c.env.PASSWORD_RESET_TOKENS, token);

    if (!tokenData) {
      return c.json({ error: 'Invalid or expired reset link' }, 400);
    }

    // Check if token was invalidated
    if (await isTokenInvalidated(c.env.PASSWORD_RESET_TOKENS, tokenData.userId, 'reset', tokenData.createdAt)) {
      return c.json({ error: 'This reset link has been invalidated' }, 400);
    }

    // Delete token immediately (single-use)
    await deleteToken(c.env.PASSWORD_RESET_TOKENS, token);

    // Create signed request to backend
    const { signature, timestamp, payload } = await createSignedHeaders(
      tokenData.userId,
      'reset-password',
      c.env.EDGE_SIGNING_SECRET
    );

    // Proxy to backend with signature
    const backendResponse = await fetch(`${c.env.BACKEND_URL}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(createBackendHeaders(c).entries()),
        'X-Edge-Signature': signature,
        'X-Edge-Timestamp': timestamp.toString(),
        'X-Edge-User-Id': tokenData.userId,
        'X-Edge-Payload': JSON.stringify(payload),
      },
      body: JSON.stringify({ newPassword }),
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend reset password error:', backendResponse.status, errorData);
      return c.json({ error: 'Failed to reset password' }, 500);
    }

    return c.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/v1/auth/verify-email
 * Verify email using a valid token (token sent via POST body from frontend)
 */
app.post('/api/v1/auth/verify-email', async (c) => {
  try {
    const body = await c.req.json<{ token: string }>();
    const { token } = body;

    if (!token) {
      return c.json({ error: 'Verification token is required' }, 400);
    }

    // Look up token
    const tokenData = await getToken(c.env.EMAIL_VERIFY_TOKENS, token);

    if (!tokenData) {
      return c.json({ error: 'Invalid or expired verification link' }, 400);
    }

    // Check if token was invalidated
    if (await isTokenInvalidated(c.env.EMAIL_VERIFY_TOKENS, tokenData.userId, 'verify', tokenData.createdAt)) {
      return c.json({ error: 'This verification link has been invalidated' }, 400);
    }

    // Delete token immediately (single-use)
    await deleteToken(c.env.EMAIL_VERIFY_TOKENS, token);

    // Create signed request to backend
    const { signature, timestamp, payload } = await createSignedHeaders(
      tokenData.userId,
      'verify-email',
      c.env.EDGE_SIGNING_SECRET
    );

    // Proxy to backend with signature
    const backendResponse = await fetch(`${c.env.BACKEND_URL}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(createBackendHeaders(c).entries()),
        'X-Edge-Signature': signature,
        'X-Edge-Timestamp': timestamp.toString(),
        'X-Edge-User-Id': tokenData.userId,
        'X-Edge-Payload': JSON.stringify(payload),
      },
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend verify email error:', backendResponse.status, errorData);
      return c.json({ error: 'Failed to verify email' }, 500);
    }

    return c.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/v1/auth/resend-verification
 * Resend verification email (requires email in body)
 */
app.post('/api/v1/auth/resend-verification', async (c) => {
  try {
    const body = await c.req.json<{ email: string }>();
    const email = body.email?.toLowerCase()?.trim();

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // Get client IP for rate limiting
    const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';

    // Check rate limits
    const rateLimit = await checkRateLimit(
      email,
      clientIp,
      c.env.RATE_LIMIT_COUNTERS,
      'email-verify'
    );

    if (!rateLimit.allowed) {
      return c.json({
        message: 'If an unverified account exists with this email, you will receive a verification link.',
      });
    }

    // Check if email exists and is unverified
    const checkResponse = await fetch(`${c.env.BACKEND_URL}/api/v1/auth/check-email-exists`, {
      method: 'POST',
      headers: createBackendHeaders(c),
      body: JSON.stringify({ email, checkVerified: true }),
    });

    if (!checkResponse.ok) {
      return c.json({
        message: 'If an unverified account exists with this email, you will receive a verification link.',
      });
    }

    const checkData = await checkResponse.json<{
      exists: boolean;
      userId?: string;
      name?: string;
      emailVerified?: boolean;
    }>();

    if (!checkData.exists || !checkData.userId || checkData.emailVerified) {
      // Don't reveal account status
      return c.json({
        message: 'If an unverified account exists with this email, you will receive a verification link.',
      });
    }

    // Invalidate any existing tokens for this user
    await invalidateUserTokens(c.env.EMAIL_VERIFY_TOKENS, checkData.userId, 'verify');

    // Generate secure token
    const token = generateSecureToken();
    const ipHash = await hashIp(clientIp);

    const tokenData: TokenData = {
      userId: checkData.userId,
      email,
      type: 'verify',
      createdAt: Math.floor(Date.now() / 1000),
      ipHash,
      userAgent: c.req.header('user-agent') || 'unknown',
    };

    // Store token with 24 hour TTL
    await storeToken(c.env.EMAIL_VERIFY_TOKENS, token, tokenData, TOKEN_TTL.EMAIL_VERIFY);

    // Build verify URL (token in fragment for security - not sent to server in logs)
    const verifyUrl = `${c.env.FRONTEND_URL}/verify-email#token=${token}`;

    // Generate email content
    const emailContent = emailVerificationEmail({
      verifyUrl,
      userName: checkData.name,
      expiresInHours: Math.floor(TOKEN_TTL.EMAIL_VERIFY / 3600),
    });

    // Send email
    const emailResult = await sendEmail({
      to: { email, name: checkData.name },
      from: { email: c.env.FROM_EMAIL, name: c.env.FROM_NAME },
      subject: 'Verify Your FlexForge Email',
      html: emailContent.html,
      text: emailContent.text,
      dkimPrivateKey: c.env.DKIM_PRIVATE_KEY,
      dkimSelector: 'mailchannels',
      dkimDomain: 'flexforge.ai',
    });

    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
    }

    return c.json({
      message: 'If an unverified account exists with this email, you will receive a verification link.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================================================
// END PASSWORD RESET & EMAIL VERIFICATION ENDPOINTS
// ============================================================================

// Proxy all other requests to backend via Cloudflare Tunnel
app.all('*', async (c) => {
  const url = new URL(c.req.url);
  const backendUrl = `${c.env.BACKEND_URL}${url.pathname}${url.search}`;

  // Build headers with Cloudflare Access auth
  const headers = createBackendHeaders(c);

  // Forward additional headers
  const forwardHeaders = ['accept', 'user-agent', 'referer'];
  for (const header of forwardHeaders) {
    const value = c.req.header(header);
    if (value) {
      headers.set(header, value);
    }
  }

  // Add client IP for backend logging/rate limiting
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for');
  if (clientIp) {
    headers.set('x-real-ip', clientIp);
  }

  // Add user info from JWT if authenticated
  const jwtPayload = c.get('jwtPayload');
  if (jwtPayload) {
    headers.set('X-User-Id', jwtPayload.sub);
    headers.set('X-User-Email', jwtPayload.email);
    headers.set('X-User-Role', jwtPayload.role);
  }

  // Forward Cookie header to backend (for session/auth)
  const cookieHeader = c.req.header('Cookie');
  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }

  try {
    const res = await fetch(backendUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
    });

    // Forward response headers - manually handle Set-Cookie
    const responseHeaders = new Headers();

    // Copy all headers except Set-Cookie (handle separately)
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        responseHeaders.set(key, value);
      }
    });

    // Explicitly forward Set-Cookie headers (may be multiple)
    const anyHeaders = res.headers as any;
    const setCookies: string[] | undefined = anyHeaders.getSetCookie?.();

    if (setCookies && setCookies.length > 0) {
      for (const sc of setCookies) {
        responseHeaders.append('Set-Cookie', sc);
      }
    } else {
      // Fallback: single header
      const sc = res.headers.get('set-cookie');
      if (sc) responseHeaders.append('Set-Cookie', sc);
    }

    responseHeaders.set('X-Proxied-By', 'flexforge-edge');

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Backend proxy error:', error);
    return c.json(
      { error: 'Backend unavailable', message: 'Unable to reach the backend service.' },
      503
    );
  }
});

export default app;
