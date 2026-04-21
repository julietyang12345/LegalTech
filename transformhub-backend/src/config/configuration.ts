export default () => ({
  port: parseInt(process.env.PORT || '4010', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'flexforge',
    password: process.env.DB_PASSWORD || 'flexforge_dev_password',
    database: process.env.DB_DATABASE || 'transformhub_dev',
    ssl: process.env.DB_SSL === 'true',
    url: process.env.DATABASE_URL,
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  transformhub: {
    apiKey: process.env.TRANSFORMHUB_API_KEY || '',
    requestBodyLimit: process.env.TRANSFORMHUB_REQUEST_BODY_LIMIT || '10mb',
    shareSecret: process.env.TRANSFORMHUB_SHARE_SECRET || process.env.TRANSFORMHUB_API_KEY || '',
    shareLinkTtlHours: parseInt(process.env.TRANSFORMHUB_SHARE_LINK_TTL_HOURS || '168', 10),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    models: {
      taxonomySuggestion: process.env.OPENAI_MODEL_TAXONOMY || 'gpt-5.4-nano',
      schemaFallback: process.env.OPENAI_MODEL_SCHEMA || 'gpt-5.4-mini',
      suggestedFix: process.env.OPENAI_MODEL_SUGGESTED_FIX || 'gpt-5.4-nano',
    },
  },
});
