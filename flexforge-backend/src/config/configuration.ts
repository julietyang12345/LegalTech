export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'flexforge',
    password: process.env.DB_PASSWORD || 'flexforge_dev_password',
    database: process.env.DB_DATABASE || 'flexforge_dev',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
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
});
