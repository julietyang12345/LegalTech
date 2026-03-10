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
  modelNameSemantic: process.env.MODEL_NAME_SEMANTIC || process.env.OPENAI_MODEL_PRO || 'gpt-4.1-mini',
  modelNameLabel: process.env.MODEL_NAME_LABEL || process.env.MODEL_NAME || 'qwen2.5:7b',
  modelTimeoutMs: Math.max(Number(process.env.MODEL_TIMEOUT_MS || 600000), 300000),
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModelPro: process.env.OPENAI_MODEL_PRO || 'gpt-4.1-mini',
  openAiInputCostPer1M: Number(process.env.OPENAI_INPUT_COST_PER_1M || 0.4),
  openAiOutputCostPer1M: Number(process.env.OPENAI_OUTPUT_COST_PER_1M || 1.6),
  stripeUpgradeUrl: process.env.STRIPE_UPGRADE_URL || '',
  proMonthlyPriceUsd: Number(process.env.PRO_MONTHLY_PRICE_USD || 8),
};

export const isProd = config.nodeEnv === 'production';
