// Parse DATABASE_URL if provided (cloud providers like Neon/Supabase use this format)
const parseDatabaseUrl = (url: string | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 5432,
      username: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1), // Remove leading /
      ssl:
        url.includes('sslmode=require') ||
        parsed.searchParams.get('sslmode') === 'require',
    };
  } catch {
    return null;
  }
};

export default () => {
  const dbFromUrl = parseDatabaseUrl(process.env.DATABASE_URL);

  return {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontend: {
      url: process.env.FRONTEND_URL || 'http://localhost:5173',
    },
    database: {
      url: process.env.DATABASE_URL,
      host: dbFromUrl?.host || process.env.DB_HOST || 'localhost',
      port: dbFromUrl?.port || parseInt(process.env.DB_PORT, 10) || 5432,
      username: dbFromUrl?.username || process.env.DB_USERNAME || 'flexforge',
      password:
        dbFromUrl?.password ||
        process.env.DB_PASSWORD ||
        'flexforge_dev_password',
      database:
        dbFromUrl?.database || process.env.DB_DATABASE || 'flexforge_dev',
      ssl: dbFromUrl?.ssl || process.env.DB_SSL === 'true',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || '',
    },
    jwt: {
      secret: (() => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET environment variable is required and must be at least 32 characters');
        }
        return secret;
      })(),
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    // Edge worker signing secret for password reset/email verification
    EDGE_SIGNING_SECRET: process.env.EDGE_SIGNING_SECRET || '',
    ai: {
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
      },
      gemini: {
        apiKey: process.env.GOOGLE_AI_API_KEY || '',
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY || '',
      },
      primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'anthropic',
      fallbackEnabled: process.env.AI_FALLBACK_ENABLED === 'true',
    },
    google: {
      cse: {
        apiKey: process.env.GOOGLE_CSE_API_KEY || '',
        engineId: process.env.GOOGLE_CSE_ID || '',
      },
    },
    rateLimit: {
      ttl: parseInt(process.env.RATE_LIMIT_TTL, 10) || 60,
      limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    },
    storage: {
      type: process.env.STORAGE_TYPE || 'local',
      path: process.env.STORAGE_PATH || './uploads',
    },
    email: {
      sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY || '',
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@flexforge.com',
      },
    },
    analytics: {
      posthog: {
        apiKey: process.env.POSTHOG_API_KEY || '',
        host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
      },
    },
    sentry: {
      dsn: process.env.SENTRY_DSN || '',
    },
    features: {
      videoIndexing: process.env.ENABLE_VIDEO_INDEXING === 'true',
      aiTutor: process.env.ENABLE_AI_TUTOR === 'true',
      socialFeatures: process.env.ENABLE_SOCIAL_FEATURES === 'true',
    },
  };
};
