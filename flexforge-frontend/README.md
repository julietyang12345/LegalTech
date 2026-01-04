# FlexForge Frontend

AI-Powered Rapid Skill Acquisition Platform - Frontend built with React + Vite + TypeScript + Tailwind CSS.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
src/
├── components/
│   ├── common/          # Shared UI components (Button, Card, Input, etc.)
│   ├── companion/       # Flexi companion chat components
│   ├── layout/          # MainLayout, FocusModeLayout
│   ├── session/         # 8-step session components
│   └── auth/            # Protected route wrapper
├── pages/
│   ├── LandingPage.tsx  # Public landing page
│   ├── LoginPage.tsx    # Auth - login
│   ├── RegisterPage.tsx # Auth - register
│   ├── StartPage.tsx    # Create curriculum
│   ├── TodayPage.tsx    # Main hub (single CTA)
│   ├── SessionPage.tsx  # Focus mode (8-step flow)
│   ├── PlanPage.tsx     # Curriculum timeline
│   ├── ShowcasePage.tsx # Portfolio + skill tree
│   └── VaultPage.tsx    # Knowledge base (PRO+)
├── stores/              # Zustand state management
│   ├── authStore.ts     # Auth state
│   ├── sessionStore.ts  # Session & focus mode state
│   └── companionStore.ts# Flexi companion state
├── services/            # API services
│   ├── api.ts           # Axios instance
│   ├── authService.ts
│   ├── sessionService.ts
│   ├── progressService.ts
│   ├── projectService.ts
│   └── companionService.ts
├── types/               # TypeScript types matching backend
├── hooks/               # Custom React hooks
├── utils/               # Utility functions
└── styles/
    └── globals.css      # Tailwind + custom styles
```

## 🎨 Design System

Based on FRONTEND_DESIGN_V2.md - Companion-First, Focus Mode, Outcome-Based.

### Colors
- **Brand Blue** (#2D5A87): Primary brand, stability, trust
- **Focus Teal** (#10B981): Only during active tasks
- **Alert Amber** (#F59E0B): Warnings, stuck detection

### Typography
- **Display/Headings**: DM Sans (600-700 weight)
- **Body**: DM Sans (400-500 weight)
- **Code**: JetBrains Mono

## 🔑 Key Features

### Public (No Login)
- Landing page with features, pricing, how it works
- Login/Register pages

### Protected (Login Required)
- **Today**: Single "Start Session" CTA, Yesterday's Fog, Boss countdown
- **Session**: 8-step focus mode (Pre-prompt → Video → Recall → Bridge → Check → Task → Boss Milestone → Reflect)
- **Plan**: Timeline view, Life Happens (Sprint/Extend/Pause), Backlog
- **Showcase**: RPG Skill Tree, "What You Can Build", project portfolio
- **Vault** (PRO+): AI summaries, bookmarks, code snippets, spaced repetition

### Companion (Flexi)
- Floating chat bubble on all pages
- Quick actions for common needs
- Celebrations on completions
- Support when struggling

## 🔌 Backend Integration

Expects backend at `VITE_API_URL` (default: `http://localhost:3000/api/v1`)

### Required Endpoints
- `POST /auth/login` - Login
- `POST /auth/register` - Register
- `GET /auth/profile` - Get user profile
- `POST /sessions` - Create session with curriculum
- `GET /sessions/active` - Get active session
- `PATCH /sessions/:id` - Update session (mode, status)
- `GET /progress/session/:id` - Get progress
- `PATCH /progress/session/:id/task/:taskId` - Update task progress
- `POST /companion/chat` - Chat with Flexi

## 📦 Dependencies

- **React 18** - UI framework
- **React Router 6** - Routing
- **Zustand** - State management
- **TanStack Query** - Data fetching
- **Framer Motion** - Animations
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Axios** - HTTP client

## 🚢 Deployment

### Cloudflare Pages
```bash
npm run build
# Deploy dist/ folder to Cloudflare Pages
```

### Environment Variables
Set `VITE_API_URL` to your production backend URL.

## 📝 License

MIT
