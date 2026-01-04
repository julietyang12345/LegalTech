declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Application
      NODE_ENV: 'development' | 'production' | 'test';
      PORT: string;

      // Database
      DB_HOST: string;
      DB_PORT: string;
      DB_USERNAME: string;
      DB_PASSWORD: string;
      DB_DATABASE: string;

      // Redis
      REDIS_HOST: string;
      REDIS_PORT: string;

      // JWT
      JWT_SECRET: string;
      JWT_EXPIRES_IN: string;

      // AI APIs
      ANTHROPIC_API_KEY: string;
      OPENAI_API_KEY: string;
      GROQ_API_KEY: string;

      // Rate Limiting
      MAX_REQUESTS_PER_HOUR: string;
      AI_REQUESTS_PER_DAY_FREE: string;
      AI_REQUESTS_PER_DAY_PRO: string;

      // Frontend
      FRONTEND_URL: string;
    }
  }
}

export {};