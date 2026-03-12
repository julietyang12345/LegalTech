import type { Request, Response, NextFunction } from 'express';

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  name: string;
  windowMs: number;
  max: number;
  key: (req: Request) => string;
};

const buckets = new Map<string, Bucket>();
let cleanupCounter = 0;

const maybeCleanup = (now: number): void => {
  cleanupCounter += 1;
  if (cleanupCounter % 100 !== 0) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
};

const getIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || 'unknown-ip';
};

export const byIpKey = (req: Request): string => `ip:${getIp(req)}`;

export const byUserOrIpKey = (req: Request): string => {
  const userId = req.user?.id?.trim();
  if (userId) return `user:${userId}`;
  return byIpKey(req);
};

export const createRateLimit = (options: RateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    maybeCleanup(now);

    const key = `${options.name}:${options.key(req)}`;
    const existing = buckets.get(key);
    const isExpired = !existing || existing.resetAt <= now;
    const bucket: Bucket = isExpired
      ? { count: 0, resetAt: now + options.windowMs }
      : existing;

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, options.max - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        message: 'Too many requests. Please retry shortly.',
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
};
