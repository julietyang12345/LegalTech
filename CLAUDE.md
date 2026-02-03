# Claude Code Rules for FlexForge

## Database Access (Production)

- **Container name**: `flexforge-db-prod`
- **Database name**: `flexforge_dev`
- **User**: `flexforge`
- **TypeORM uses camelCase column names** - wrap in double quotes for raw SQL queries

```bash
# Connect to database
docker exec -it flexforge-db-prod psql -U flexforge -d flexforge_dev

# Query with camelCase columns (MUST use double quotes)
docker exec -it flexforge-db-prod psql -U flexforge -d flexforge_dev -c 'SELECT "createdAt", "pricePreference" FROM waitlist;'

# List tables
docker exec -it flexforge-db-prod psql -U flexforge -d flexforge_dev -c "\dt"

# List databases
docker exec -it flexforge-db-prod psql -U flexforge -d postgres -c "\l"

# Upgrade user to PRO (quotaTier column, not tier)
docker exec -it flexforge-db-prod psql -U flexforge -d flexforge_dev -c 'UPDATE users SET "quotaTier" = '\''PRO'\'' WHERE email = '\''user@example.com'\'';'

# Verify user tier
docker exec -it flexforge-db-prod psql -U flexforge -d flexforge_dev -c 'SELECT email, "quotaTier" FROM users WHERE email = '\''user@example.com'\'';'

# List all users with their tiers
docker exec -it flexforge-db-prod psql -U flexforge -d flexforge_dev -c 'SELECT email, "quotaTier" FROM users;'
```

## Key Table Columns

### users table
- `quotaTier` (not `tier`) - enum: FREE, PRO, PREMIUM, UNLIMITED
- `curriculaGeneratedThisMonth`
- `aiTokensUsedThisMonth`
- `tokensUsedThisMonth`

### waitlist table
- `createdAt`, `pricePreference`, `userId`, `convertedAt`, `convertedTier`

## Common Mistakes to Avoid

### PostgreSQL Column Names
- TypeORM default: camelCase (`createdAt`, `pricePreference`, `userId`)
- Raw SQL requires double quotes: `"createdAt"` not `created_at`
- Wrong: `SELECT * FROM waitlist ORDER BY created_at`
- Correct: `SELECT * FROM waitlist ORDER BY "createdAt"`

### Cache Bypass Order
- Always check `forceRegenerate` flag BEFORE checking cache
- Wrong pattern:
  ```typescript
  if (cached) return cached;  // Returns cache!
  const forceRegenerate = ...;  // Too late!
  ```
- Correct pattern:
  ```typescript
  const forceRegenerate = ...;  // Check first
  if (!forceRegenerate && cached) return cached;
  ```

## Project Structure

- Frontend: `flexforge-frontend/` (React + Vite)
- Backend: `flexforge-backend/` (NestJS)
- TypeScript in both - run `npx tsc --noEmit` to check compilation

## API Patterns

- Backend API base: `/api/v1/`
- Auth: JWT with HTTP-only cookies
- Optional auth guard: `OptionalAuthGuard` (allows anonymous + authenticated)
