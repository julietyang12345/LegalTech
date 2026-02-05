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
- Edge Worker: `flexforge-edge/` (Cloudflare Worker)
- TypeScript in both - run `npx tsc --noEmit` to check compilation

## Remote Server Deployment

- **Server**: `ssh j@10.3.8.169`
- **Deploy method**: Docker
- **Backend path**: `/home/j/flexforge-backend/`

```bash
# SSH into server
ssh j@10.3.8.169

# Check running containers
docker ps | grep flex

# View backend logs
docker logs flexforge-api-prod --tail 100

# Restart backend with new env
cd /home/j/flexforge-backend
docker-compose -f docker-compose.prod.yml up -d --force-recreate api

# Add new env variable
echo "NEW_VAR=value" >> .env
```

## Edge Worker (Cloudflare)

- **Deploy**: `cd flexforge-edge && npx wrangler deploy`
- **Logs**: `npx wrangler tail`
- **Secrets**: `npx wrangler secret put SECRET_NAME`
- **Email service**: Resend API (RESEND_API_KEY secret)

## API Patterns

- Backend API base: `/api/v1/`
- Auth: JWT with HTTP-only cookies
- Optional auth guard: `OptionalAuthGuard` (allows anonymous + authenticated)

### Redundancy Patterns to Avoid

| Bad Pattern | Good Pattern |
|-------------|--------------|
| Multiple AI calls for same content | Generate both in same prompt |
| Copy-paste if/else across methods | Extract to helper function |
| 50+ line template strings duplicated | Shared template builder function |
| Inline language feature checks | Use `extractLangFeatures(params)` |
| Repeated day finding logic | Use `getDayOverview()` |

### Before Creating New Code
1. `grep -rn "similar_pattern" src/` - search for existing implementations
2. Check if helper function already exists in this file
3. If pattern will be used 2+ times, create a shared helper
4. Add new shared utilities to this documentation

### How to Check for Redundancy
```bash
# Find similar code blocks
grep -rn "pattern" src/modules/

# Check for duplicate function logic
npx jscpd src/ --min-lines 5 --min-tokens 50
```
