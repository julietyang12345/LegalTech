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
  },
});
