import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { initDb } from './db.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { importsRouter } from './routes/imports.js';
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
  res.status(500).json({ message });
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
