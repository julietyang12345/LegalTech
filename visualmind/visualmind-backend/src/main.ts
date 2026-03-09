import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config, isProd } from './config.js';
import { initDb } from './db.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { importsRouter } from './routes/imports.js';
import { byIpKey, createRateLimit } from './middleware/rate-limit.js';
import { warmupModel } from './services/model.service.js';

const app = express();

app.use(cookieParser());
app.use(
  cors({
    origin: [config.frontendUrl],
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    next();
    return;
  }

  const hasCookieAuth = Boolean(req.cookies?.[config.cookieName]);
  if (!hasCookieAuth) {
    next();
    return;
  }

  if (!req.headers['x-requested-with']) {
    res.status(403).json({ message: 'Forbidden: missing CSRF header' });
    return;
  }
  next();
});

app.use(
  '/api/v1/auth',
  createRateLimit({
    name: 'auth',
    windowMs: 60_000,
    max: 120,
    key: byIpKey,
  }),
);

app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/vm/projects', projectsRouter);
app.use('/api/v1/imports', importsRouter);

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${message}`);
  if (stack) {
    console.error(stack);
  }
  res.status(500).json({ message: isProd ? 'Internal server error' : message });
});

const bootstrap = async (): Promise<void> => {
  await initDb();
  void warmupModel();
  app.listen(config.port, () => {
    console.log(`visualmind-backend listening on :${config.port}`);
  });
};

bootstrap().catch((error) => {
  console.error('Failed to bootstrap', error);
  process.exit(1);
});
