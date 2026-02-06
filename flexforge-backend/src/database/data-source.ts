import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env files
dotenv.config({ path: '.env.production' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Parse DATABASE_URL if provided
const parseDatabaseUrl = (url: string | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 5432,
      username: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1),
      ssl: url.includes('sslmode=require') || parsed.searchParams.get('sslmode') === 'require',
    };
  } catch {
    return null;
  }
};

const dbFromUrl = parseDatabaseUrl(process.env.DATABASE_URL);

// Detect if running from compiled JS (dist/) or TypeScript source (src/)
const isCompiled = __dirname.includes('dist');
const entitiesPath = isCompiled
  ? path.join(__dirname, '..', 'database', 'entities', '**', '*.entity.js')
  : path.join(__dirname, 'entities', '**', '*.entity.ts');
const migrationsPath = isCompiled
  ? path.join(__dirname, '..', 'database', 'migrations', '**', '*.js')
  : path.join(__dirname, 'migrations', '**', '*.ts');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbFromUrl?.host || process.env.DB_HOST || 'localhost',
  port: dbFromUrl?.port || parseInt(process.env.DB_PORT, 10) || 5432,
  username: dbFromUrl?.username || process.env.DB_USERNAME || 'flexforge',
  password: dbFromUrl?.password || process.env.DB_PASSWORD || 'flexforge_dev_password',
  database: dbFromUrl?.database || process.env.DB_DATABASE || 'flexforge_dev',
  ssl: dbFromUrl?.ssl || process.env.DB_SSL === 'true',
  entities: [entitiesPath],
  migrations: [migrationsPath],
  synchronize: false,
  logging: true,
});
