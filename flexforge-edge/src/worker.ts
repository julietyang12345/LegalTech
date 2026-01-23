import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Redis } from '@upstash/redis/cloudflare';

// Type definitions for Cloudflare bindings
type Bindings = {
  VIDEO_CACHE: KVNamespace;
  TRANSCRIPT_CACHE: KVNamespace;
  DOC_CACHE: KVNamespace;
  BACKEND_URL: string;
  UPSTASH_REDIS_URL: string;
  UPSTASH_REDIS_TOKEN: string;
};

type Variables = {
  redis: Redis;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS configuration
app.use(
  '*',
  cors({
    origin: [
      'https://flexforge.app',
      'https://www.flexforge.app',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
  })
);

// Initialize Redis middleware
app.use('*', async (c, next) => {
  if (c.env.UPSTASH_REDIS_URL && c.env.UPSTASH_REDIS_TOKEN) {
    const redis = new Redis({
      url: c.env.UPSTASH_REDIS_URL,
      token: c.env.UPSTASH_REDIS_TOKEN,
    });
    c.set('redis', redis);
  }
  await next();
});

// Rate limiting middleware
app.use('*', async (c, next) => {
  const redis = c.get('redis');
  if (!redis) {
    // Skip rate limiting if Redis is not configured
    await next();
    return;
  }

  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const key = `rate:${ip}`;

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 60); // 60 second window
    }

    // Set rate limit headers
    c.header('X-RateLimit-Limit', '100');
    c.header('X-RateLimit-Remaining', String(Math.max(0, 100 - count)));

    if (count > 100) {
      return c.json(
        { error: 'Rate limited', message: 'Too many requests. Please try again later.' },
        429
      );
    }
  } catch (error) {
    // Log error but don't block the request if rate limiting fails
    console.error('Rate limiting error:', error);
  }

  await next();
});

// Health check endpoint
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

  // Proxy to backend
  const backendUrl = `${c.env.BACKEND_URL}/api/v1/videos/${videoId}/enrichment`;
  const res = await fetch(backendUrl, {
    headers: {
      Authorization: c.req.header('Authorization') || '',
      'Content-Type': 'application/json',
    },
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

  // Proxy to backend
  const backendUrl = `${c.env.BACKEND_URL}/api/v1/videos/${videoId}/transcript`;
  const res = await fetch(backendUrl, {
    headers: {
      Authorization: c.req.header('Authorization') || '',
      'Content-Type': 'application/json',
    },
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

  // Proxy to backend
  const backendUrl = `${c.env.BACKEND_URL}/api/v1/docs/${docId}`;
  const res = await fetch(backendUrl, {
    headers: {
      Authorization: c.req.header('Authorization') || '',
      'Content-Type': 'application/json',
    },
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

// Proxy all other requests to Fly.io backend
app.all('*', async (c) => {
  const url = new URL(c.req.url);
  const backendUrl = `${c.env.BACKEND_URL}${url.pathname}${url.search}`;

  // Forward headers, preserving important ones
  const headers = new Headers();
  const forwardHeaders = ['authorization', 'content-type', 'accept', 'user-agent'];

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
