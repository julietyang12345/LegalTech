# FlexForge AI Routing - Quick Reference

## 🎯 What Changed

### Updated Files:
1. ✅ **`src/modules/ai/ai.service.ts`** - Enhanced AI routing logic
2. ✅ **AI_ROUTING_ARCHITECTURE.md** - Complete documentation

### New Capabilities:
- ✅ **Gemini Integration** - Video summarization and multimodal analysis
- ✅ **Smart Fallback System** - Automatic provider switching
- ✅ **26 Task Types** - Properly categorized by provider
- ✅ **Cost Optimization** - Right model for each task

## 📋 Provider Usage Summary

| Provider | Primary Use Case | Example Tasks | Cost/Call |
|----------|-----------------|---------------|-----------|
| **Claude Sonnet 4** | Heavy reasoning | Curriculum, code generation | $0.05-0.07 |
| **Claude Haiku 3.5** | Interactive tutoring | AI tutor, code review | $0.003-0.008 |
| **Gemini Flash 2.0** | Video & multimodal | Video summary, timestamps | $0.01-0.05 |
| **GPT-4o-mini** | Simple logic | Quiz gen, batch processing | $0.001-0.003 |
| **Groq Llama 3.1** | Ultra-fast text | Email summaries | $0.0003-0.0008 |

## 🔄 How to Use

### Example 1: AI Tutor (Claude Haiku)
```typescript
import { AITask } from './modules/ai/ai.service';

// Route to Claude Haiku for interactive tutoring
const response = await aiService.routeRequest(
  AITask.TUTOR_CHAT,
  `User asks: "Why isn't my loop working?"
  
  Code:
  for i in range(10)
    print(i)
  `,
  'You are a patient AI tutor helping students debug code.'
);

// Response uses Claude Haiku ($0.005)
// Fast (2s), good reasoning, cost-effective
```

### Example 2: Video Summary (Gemini)
```typescript
// Route to Gemini for video analysis
const response = await aiService.routeRequest(
  AITask.VIDEO_SUMMARY,
  `Transcript: [full video transcript]
  
  Generate a structured summary with:
  1. Main topics covered
  2. Key timestamps
  3. Learning objectives`,
  'You are creating video summaries for educational content.'
);

// Response uses Gemini Flash 2.0 ($0.02)
// Fast (1s), optimized for video/text
```

### Example 3: Generate Quiz (GPT-4o-mini)
```typescript
// Route to GPT-4o-mini for simple question generation
const response = await aiService.routeRequest(
  AITask.QUIZ_GENERATION,
  `Topic: Python Lists
  Difficulty: Beginner
  
  Generate 5 multiple choice questions.`,
  'You generate educational quiz questions.'
);

// Response uses GPT-4o-mini ($0.002)
// Fast (3s), good for templates
```

### Example 4: Email Summary (Groq)
```typescript
// Route to Groq for blazing fast text generation
const response = await aiService.routeRequest(
  AITask.EMAIL_SUMMARY,
  `User completed:
  - Day 1: Variables
  - Day 2: Loops
  
  Generate a progress email summary.`,
  'You create concise progress summaries.'
);

// Response uses Groq Llama 3.1 ($0.0005)
// Ultra-fast (0.5s), 400 tokens/sec
```

## 🎯 All Available Tasks

### Claude Sonnet 4 (Heavy Reasoning)
- `AITask.CURRICULUM_GENERATION`
- `AITask.CODE_GENERATION`

### Claude Haiku 3.5 (Interactive)
- `AITask.TUTOR_CHAT`
- `AITask.ALTERNATIVE_EXPLANATION`
- `AITask.CODE_REVIEW`
- `AITask.STUCK_DETECTION`
- `AITask.LIFE_HAPPENS_ADJUST`
- `AITask.REFLECTION_ANALYSIS`

### Gemini Flash 2.0 (Video/Multimodal)
- `AITask.VIDEO_SUMMARY`
- `AITask.VIDEO_TIMESTAMP_EXTRACTION`
- `AITask.VIDEO_CHAPTER_GENERATION`
- `AITask.TRANSCRIPT_ANALYSIS`
- `AITask.VISUAL_CONTENT_ANALYSIS`

### GPT-4o-mini (Basic Logic)
- `AITask.BATCH_LOGIC`
- `AITask.QUIZ_GENERATION`
- `AITask.SPACED_REPETITION_SCHEDULE`
- `AITask.SIMPLE_CLASSIFICATION`
- `AITask.DATA_VALIDATION`

### Groq Llama 3.1 (Fast Text)
- `AITask.EMAIL_SUMMARY`
- `AITask.NOTIFICATION_GENERATION`

## 🔄 Smart Fallback System

If primary provider fails, system automatically tries alternatives:

**Example: AI Tutor Chat**
1. Try: Claude Haiku (primary)
2. Fallback: Claude Sonnet (better reasoning)
3. Fallback: GPT-4o-mini (basic capability)
4. Error: All providers failed

**Example: Video Summary**
1. Try: Gemini Flash (primary)
2. Fallback: Claude Haiku (text-only analysis)
3. Fallback: GPT-4o-mini (basic summary)
4. Error: All providers failed

## 💰 Cost Breakdown (1000 Users/Month)

| Task Type | Calls | Provider | Cost |
|-----------|-------|----------|------|
| Curriculum Gen | 3,000 | Claude Sonnet | $180 |
| AI Tutor | 20,000 | Claude Haiku | $100 |
| Video Summary | 5,000 | Gemini Flash | $100 |
| Quiz Gen | 10,000 | GPT-4o-mini | $20 |
| Email Summary | 30,000 | Groq Llama | $15 |
| **TOTAL** | **68,000** | | **$415/mo** |

**With 80% caching:** $191/month (54% savings)

## 🚀 Quick Start

### 1. Update your imports:
```typescript
import { AiService, AITask } from './modules/ai/ai.service';
```

### 2. Inject AI Service:
```typescript
constructor(private aiService: AiService) {}
```

### 3. Use proper task types:
```typescript
// OLD (generic)
await aiService.routeRequest(
  'TUTOR_CHAT',  // ❌ String
  prompt
);

// NEW (typed)
await aiService.routeRequest(
  AITask.TUTOR_CHAT,  // ✅ Enum
  prompt
);
```

## 📊 Performance Comparison

| Provider | Speed | Quality | Cost | Best For |
|----------|-------|---------|------|----------|
| Claude Sonnet 4 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 💰💰💰 | Complex reasoning |
| Claude Haiku 3.5 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 💰💰 | Interactive chat |
| Gemini Flash 2.0 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 💰 | Video/multimodal |
| GPT-4o-mini | ⭐⭐⭐⭐ | ⭐⭐⭐ | 💰 | Simple logic |
| Groq Llama 3.1 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 💰 | Fast text |

## 🎓 Real-World Examples

### Student Debugging Session
```typescript
// Step 1: Student submits code with error
const codeReview = await aiService.routeRequest(
  AITask.CODE_REVIEW,  // Claude Haiku - $0.005
  studentCode,
  'Analyze this code and explain the error'
);

// Step 2: Student asks follow-up question
const tutorResponse = await aiService.routeRequest(
  AITask.TUTOR_CHAT,  // Claude Haiku - $0.005
  "Why does the error happen?",
  contextFromPrevious
);

// Total cost: $0.01 per debugging session
// Response time: 2-3 seconds each
```

### Video-Based Learning
```typescript
// Step 1: Generate video summary
const summary = await aiService.routeRequest(
  AITask.VIDEO_SUMMARY,  // Gemini Flash - $0.02
  videoTranscript,
  'Create a structured learning summary'
);

// Step 2: Extract timestamps
const timestamps = await aiService.routeRequest(
  AITask.VIDEO_TIMESTAMP_EXTRACTION,  // Gemini Flash - $0.015
  videoTranscript,
  'Find topic boundaries with timestamps'
);

// Total cost: $0.035 per video
// Response time: 1-2 seconds
```

### Daily Automation
```typescript
// Step 1: Analyze confidence scores (batch)
const analysis = await aiService.routeRequest(
  AITask.BATCH_LOGIC,  // GPT-4o-mini - $0.002
  allUserScores,
  'Calculate average confidence and identify weak areas'
);

// Step 2: Send email summaries
const emails = await Promise.all(
  users.map(user => 
    aiService.routeRequest(
      AITask.EMAIL_SUMMARY,  // Groq - $0.0005
      user.progress,
      'Create progress email'
    )
  )
);

// Total cost: $0.002 + ($0.0005 × users)
// For 1000 users: $0.50 total
```

## ✅ Migration Checklist

- [x] Updated `ai.service.ts` with new routing
- [x] Added Gemini integration
- [x] Implemented smart fallback system
- [x] Added cost calculations for all providers
- [x] Created comprehensive documentation
- [ ] Update video indexer to use Gemini tasks
- [ ] Update progress service to use new task types
- [ ] Add monitoring for provider health
- [ ] Set up A/B testing for quality comparison

## 📚 Next Steps

1. **Test the routing**: Try different task types
2. **Monitor costs**: Track provider usage
3. **Optimize**: Adjust routing based on performance
4. **Scale**: Add circuit breakers for reliability

---

**Ready to use intelligent AI routing! 🚀**