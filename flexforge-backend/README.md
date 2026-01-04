# FlexForge Backend

AI-powered learning platform backend built with NestJS, PostgreSQL, and multiple AI providers.

## Features

- ✅ Multi-AI provider routing (Claude, GPT-4, Gemini, Groq)
- ✅ Intelligent curriculum generation
- ✅ Video content indexing with Gemini
- ✅ Progress tracking and analytics
- ✅ Portfolio management
- ✅ JWT authentication
- ✅ Rate limiting and quota management
- ✅ Skill detection and validation

## Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL
- **ORM**: TypeORM
- **Cache**: Redis (optional)
- **AI Providers**:
  - Anthropic Claude (Sonnet 4, Haiku 3.5)
  - OpenAI (GPT-4o, GPT-4o-mini)
  - Google Gemini (Flash 2.0)
  - Groq (Llama 3.1 70B)
- **Authentication**: JWT + Passport

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for local database)
- AI API keys (at least Anthropic Claude)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
# Required: ANTHROPIC_API_KEY
# Optional: OPENAI_API_KEY, GOOGLE_AI_API_KEY, GROQ_API_KEY
```

### 3. Start Database

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 4. Run Application

```bash
# Development mode
npm run start:dev

# The server will start at http://localhost:4000
# API available at http://localhost:4000/api/v1
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 4000 |
| `NODE_ENV` | Environment | No | development |
| `FRONTEND_URL` | Frontend URL for CORS | No | http://localhost:5173 |
| `DB_HOST` | PostgreSQL host | Yes | localhost |
| `DB_PORT` | PostgreSQL port | Yes | 5432 |
| `DB_USERNAME` | Database user | Yes | flexforge |
| `DB_PASSWORD` | Database password | Yes | - |
| `DB_DATABASE` | Database name | Yes | flexforge_dev |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `JWT_EXPIRES_IN` | JWT expiration | No | 7d |
| `ANTHROPIC_API_KEY` | Claude API key | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key | No | - |
| `GOOGLE_AI_API_KEY` | Gemini API key | No | - |
| `GROQ_API_KEY` | Groq API key | No | - |

## API Endpoints

### Authentication

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
```

### Users

```
GET    /api/v1/users/me
GET    /api/v1/users/quota
PATCH  /api/v1/users/profile
PATCH  /api/v1/users/preferences
```

### Sessions

```
POST   /api/v1/sessions
GET    /api/v1/sessions
GET    /api/v1/sessions/active
GET    /api/v1/sessions/:id
GET    /api/v1/sessions/:id/progress
PATCH  /api/v1/sessions/:id
DELETE /api/v1/sessions/:id
```

### Curriculum

```
POST   /api/v1/curriculum/generate
POST   /api/v1/curriculum/starter-code
```

### Progress

```
GET    /api/v1/progress/session/:sessionId
GET    /api/v1/progress/session/:sessionId/stats
PATCH  /api/v1/progress/session/:sessionId/task/:taskId
```

### Projects

```
POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id
DELETE /api/v1/projects/:id
```

## Project Structure

```
src/
├── config/                 # Configuration
│   └── configuration.ts
├── database/
│   └── entities/          # TypeORM entities
│       ├── user.entity.ts
│       ├── session.entity.ts
│       ├── progress.entity.ts
│       └── project.entity.ts
├── modules/
│   ├── ai/                # AI routing service
│   ├── auth/              # Authentication
│   ├── user/              # User management
│   ├── curriculum/        # Curriculum generation
│   │   ├── services/
│   │   │   ├── skill-detector.service.ts
│   │   │   ├── gemini-video-indexer.service.ts
│   │   │   └── file-generator.service.ts
│   │   └── prompts/
│   │       └── curriculum-prompt.ts
│   ├── session/           # Learning sessions
│   ├── progress/          # Progress tracking
│   └── project/           # Portfolio
├── app.module.ts          # Root module
└── main.ts                # Entry point
```

## Development

```bash
# Development mode with hot reload
npm run start:dev

# Build for production
npm run build

# Run production build
npm run start:prod

# Run tests
npm run test

# Lint code
npm run lint

# Format code
npm run format
```

## Database Management

```bash
# View database
docker exec -it flexforge-db psql -U flexforge -d flexforge_dev

# View all tables
\dt

# View users
SELECT * FROM users;

# Stop database
docker-compose down

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

## AI Cost Estimates

Based on typical usage (100 users/month):

| Provider | Task | Cost/Call | Monthly |
|----------|------|-----------|---------|
| Claude Sonnet 4 | Curriculum gen | $0.05-0.07 | $15-20 |
| Claude Haiku 3.5 | AI Tutor | $0.003-0.008 | $60-80 |
| Gemini Flash 2.0 | Video indexing | $0.01-0.05 | $10-15 |
| GPT-4o-mini | Batch logic | $0.001-0.003 | $5-10 |
| Groq Llama 3.1 | Email summaries | $0.0003-0.0008 | $1-2 |

**Total**: ~$100-130/month for 100 active users

## Quota System

### FREE Tier
- 3 curricula/month
- 50,000 AI tokens/month
- No AI tutor access

### PRO Tier ($15/month)
- 20 curricula/month
- 500,000 AI tokens/month
- 20 AI tutor questions/day

### PREMIUM Tier ($39/month)
- 100 curricula/month
- 2,000,000 AI tokens/month
- Unlimited AI tutor

## Troubleshooting

### Database Connection Error

```bash
# Make sure Docker services are running
docker-compose ps

# Check logs
docker-compose logs postgres

# Restart services
docker-compose restart
```

### AI API Errors

```bash
# Verify API keys in .env
echo $ANTHROPIC_API_KEY

# Check API key is valid
# Test at: https://console.anthropic.com
```

### Port Already in Use

```bash
# Change PORT in .env
PORT=3001

# Or kill process using port 4000
lsof -ti:4000 | xargs kill -9
```

## Production Deployment

For production, consider:

1. **Database**: Use managed PostgreSQL (Supabase, AWS RDS)
2. **Hosting**: Deploy to Cloudflare Workers, Railway, or Fly.io
3. **Secrets**: Use environment variable management
4. **Monitoring**: Add Sentry for error tracking
5. **Caching**: Enable Redis for better performance

## License

MIT

## Support

For issues or questions, please open a GitHub issue.
