import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';

// Type definitions for Cloudflare bindings
type Bindings = {
  VIDEO_CACHE: KVNamespace;
  TRANSCRIPT_CACHE: KVNamespace;
  DOC_CACHE: KVNamespace;
  BACKEND_URL: string;
  JWT_SECRET: string;
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
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
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

// Authentication middleware
const authMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const pathname = new URL(c.req.url).pathname;

    // Skip auth for public routes
    if (isPublicRoute(pathname)) {
      await next();
      return;
    }

    // Get Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.slice(7);

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

// Proxy all other requests to backend via Cloudflare Tunnel
app.all('*', async (c) => {
  const url = new URL(c.req.url);
  const backendUrl = `${c.env.BACKEND_URL}${url.pathname}${url.search}`;

  // Build headers with Cloudflare Access auth
  const headers = createBackendHeaders(c);

  // Forward additional headers
  const forwardHeaders = ['accept', 'user-agent'];
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

  try {
    const res = await fetch(backendUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
    });

    // Forward response headers
    const responseHeaders = new Headers(res.headers);
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
