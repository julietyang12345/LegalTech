import dotenv from 'dotenv';

dotenv.config();

const required = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT || 4300),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4173',
  jwtSecret: required(process.env.JWT_SECRET, 'JWT_SECRET'),
  cookieName: process.env.COOKIE_NAME || 'access_token',
  databaseUrl: required(process.env.DATABASE_URL, 'DATABASE_URL'),
  modelApiBaseUrl: process.env.MODEL_API_BASE_URL || 'http://127.0.0.1:11434',
  modelName: process.env.MODEL_NAME || 'qwen2.5:7b',
  modelTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 300000),
};

export const isProd = config.nodeEnv === 'production';
