import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Session } from '../../database/entities/session.entity';

// Companion personality configuration
const COMPANION_CONFIG = {
  name: 'Flexi',
  personality: {
    traits: ['encouraging', 'patient', 'curious', 'warm', 'slightly playful'],
    communicationStyle: 'friendly and supportive, like a knowledgeable friend',
    avoids: ['condescension', 'pressure', 'formal/robotic language'],
  },
  emojis: {
    greeting: ['👋', '🌟', '✨', '🎯'],
    celebration: ['🎉', '🏆', '⭐', '🚀', '💪', '🌈'],
    encouragement: ['💡', '🌱', '📚', '🎯', '✨'],
    empathy: ['💙', '🤗', '🌸'],
    curiosity: ['🤔', '💭', '🔍'],
  },
};

// Message templates for different contexts
const MESSAGE_TEMPLATES = {
  // ============ GREETINGS ============
  greetings: {
    morning: [
      "Good morning, {name}! Ready to learn something amazing today? ☀️",
      "Morning, {name}! Your brain is freshest now - perfect time to tackle something new! 🌅",
      "Hey {name}! Another beautiful day to grow. What shall we explore? 🌟",
    ],
    afternoon: [
      "Hey {name}! How's your day going? Ready for some learning? 🎯",
      "Good afternoon, {name}! Taking a break to learn something cool? I love it! ✨",
      "Hi {name}! Afternoon brain boost time? Let's do this! 💪",
    ],
    evening: [
      "Evening, {name}! Winding down with some learning? Great choice! 🌙",
      "Hey {name}! Night owl learning session? I'm here for it! 🦉",
      "Hi {name}! Nothing like some evening learning. What's on your mind? ✨",
    ],
    returning: [
      "Welcome back, {name}! I missed you! Ready to pick up where we left off? 🎉",
      "{name}! So glad you're back. Let's continue your journey! 🚀",
      "Hey {name}, great to see you again! Your progress is waiting for you! 🌟",
    ],
    firstTime: [
      "Welcome to FlexForge, {name}! I'm Flexi, and I'll be your learning companion. I'm so excited to help you grow! 🎉",
      "Hey {name}! I'm Flexi - think of me as your friendly learning buddy. Let's figure out what you want to learn together! ✨",
      "Hi {name}! Welcome! I'm Flexi, and I'm here to make learning feel less like work and more like an adventure. What interests you? 🌟",
    ],
    streak: [
      "🔥 {name}! {streak} days in a row! You're on fire! Let's keep the streak going!",
      "Day {streak} of your streak, {name}! Your dedication is inspiring! 🌟",
      "{streak} days straight, {name}! That's not luck, that's commitment! 💪",
    ],
  },

  // ============ PROGRESS & ENCOURAGEMENT ============
  progress: {
    started: [
      "You've taken the first step, {name}! That's often the hardest part. I'm proud of you! 🌱",
      "And we're off! Every expert was once a beginner. Let's grow together! 🚀",
      "Chapter 1 begins! This is going to be a great journey, {name}! ✨",
    ],
    quarter: [
      "25% done, {name}! You're building real momentum now! 📈",
      "A quarter of the way there! See? You're making this happen! 💪",
      "Look at you go, {name}! 25% complete and crushing it! 🎯",
    ],
    halfway: [
      "HALFWAY THERE, {name}! 🎉 This is a huge milestone - take a moment to appreciate how far you've come!",
      "50% complete! You're at the peak now, and the view is amazing! 🏔️",
      "Half done, {name}! You've proven you can do this. The finish line is in sight! 🌟",
    ],
    threeQuarter: [
      "75%, {name}! You can almost taste the finish! Keep pushing! 🚀",
      "Three-quarters done! You're in the home stretch now! 💪",
      "75% complete! Your persistence is paying off big time! ⭐",
    ],
    almostDone: [
      "SO CLOSE, {name}! Just a little more! You've got this! 🏁",
      "90%+ done! The finish line is RIGHT THERE! 🎯",
      "Almost there! Don't stop now - you're about to achieve something great! 🌟",
    ],
    completed: [
      "🎉 YOU DID IT, {name}! 🎉 I'm so proud of you! This is a real achievement!",
      "COMPLETE! {name}, you just proved that you can learn anything you set your mind to! 🏆",
      "Finished! Take a bow, {name}! You earned this moment! 🌟✨🎊",
    ],
    moduleComplete: [
      "Module complete! 🎉 {name}, you just added a new skill to your toolkit!",
      "Another module down! Your knowledge is growing, {name}! 📚",
      "Boom! Module finished! You're becoming quite the expert, {name}! 💪",
    ],
  },

  // ============ STRUGGLE & SUPPORT ============
  struggle: {
    detected: [
      "Hey {name}, I notice this part is tricky. That's totally normal - it means you're learning! Want me to break it down differently? 💙",
      "Stuck? No worries, {name}. Even experts struggle with new things. Let's try a different approach together. 🤗",
      "This is a tough one, {name}. But here's the thing - struggling means your brain is growing. How can I help? 🌱",
    ],
    afterFail: [
      "That didn't go as planned, but that's okay! Every mistake is just feedback. Let's learn from it and try again. 💪",
      "Oops! But hey, {name}, mistakes are just stepping stones. What do you think went wrong? Let's figure it out together. 🔍",
      "Not quite, but I love that you tried! Learning happens through attempts, not just successes. Ready to go again? 🌟",
    ],
    multipleFails: [
      "I can see you're working really hard at this, {name}. Sometimes we need to step back and build up to it. Want to try some foundational exercises first? 💙",
      "Hey {name}, this is genuinely challenging material. There's no shame in needing more practice. Want me to simplify the approach? 🤗",
      "You're persistent, {name}, and I admire that. Let me try explaining this in a completely different way. 🌈",
    ],
    takingBreak: [
      "Taking a break is actually scientifically proven to help learning, {name}! Your brain will keep processing in the background. See you soon! 🧠",
      "Good call on the break! Rest is part of learning. I'll be here when you're ready. ☕",
      "Breaks are important! Go do something fun, and come back refreshed. I'll keep your spot warm! 🌸",
    ],
  },

  // ============ CELEBRATION ============
  celebration: {
    quickWin: [
      "Nice one, {name}! ✨",
      "Got it! 🎯",
      "That's it! Well done! ⭐",
      "Correct! You're getting the hang of this! 💪",
    ],
    streakMilestone: [
      "🔥 {streak} DAY STREAK! {name}, you're officially a learning machine!",
      "STREAK MILESTONE: {streak} days! Your consistency is incredible, {name}! 🏆",
      "{streak} days of dedication, {name}! This is what growth looks like! 🌟",
    ],
    newSkill: [
      "🎉 NEW SKILL UNLOCKED: {skill}! {name}, you can now add this to your toolkit!",
      "Skill acquired: {skill}! The world of {skill} is now yours, {name}! 🚀",
      "You did it! {skill} is now part of your repertoire! How does it feel? 🌟",
    ],
    personalBest: [
      "PERSONAL BEST, {name}! You just outdid yourself! 🏆",
      "New record! {name}, you're getting better every day! 📈",
      "You beat your own record! This is what progress looks like! 🎯",
    ],
  },

  // ============ LEARNING NUDGES ============
  nudges: {
    idle: [
      "Hey {name}! Haven't seen you in a while. Your {topic} curriculum is waiting whenever you're ready! 💙",
      "Missing you, {name}! Even 5 minutes of learning keeps the momentum going. Want to do a quick review? 📚",
      "Hey! Just checking in. Remember, small steps count too. Ready for a quick session? 🌱",
    ],
    suggestion: [
      "Based on what you've learned, {name}, I think you'd really enjoy {suggestion}. Want to explore it? 🔍",
      "Fun fact, {name}: {suggestion} connects really well with what you already know. Interested? 💡",
      "Hey {name}, curious about {suggestion}? It's a natural next step from here! 🚀",
    ],
    reviewReminder: [
      "Pro tip, {name}: reviewing what you learned yesterday helps it stick. Want to do a quick refresher? 🧠",
      "Your brain consolidates learning through review. Quick 5-minute refresh of {topic}? 📝",
      "Spaced repetition is science! Let's reinforce what you learned in {topic}. 🔬",
    ],
  },

  // ============ EMOTIONAL RESPONSES ============
  emotional: {
    frustrated: [
      "I hear you, {name}. Frustration is actually a sign that you care about learning this. Let's take it one small step at a time. 💙",
      "It's okay to feel frustrated. Learning hard things is... hard! But you're not alone - I'm right here with you. 🤗",
      "Take a deep breath, {name}. You're doing better than you think. Want to try a different approach? 🌸",
    ],
    excited: [
      "I LOVE your energy, {name}! Let's channel that excitement! 🚀",
      "Your enthusiasm is contagious! Let's dive in! ⚡",
      "YES! This is the spirit! Let's make some learning magic happen! ✨",
    ],
    uncertain: [
      "Not sure where to start, {name}? That's totally fine - let me guide you. What interests you most right now? 🧭",
      "Feeling overwhelmed by options? Let's narrow it down together. Tell me one thing you're curious about. 💭",
      "Analysis paralysis is real! How about I suggest something based on what I know about you? 🎯",
    ],
    proud: [
      "You SHOULD be proud, {name}! This is real growth! 🏆",
      "That pride you're feeling? You earned every bit of it! 🌟",
      "Remember this feeling, {name}. This is what achievement tastes like! 🎉",
    ],
  },

  // ============ CONVERSATIONAL ============
  conversation: {
    acknowledgment: [
      "Got it, {name}! Let me work on that... 💭",
      "Understood! Give me a moment... ✨",
      "On it! This is going to be good... 🎯",
    ],
    thinking: [
      "Hmm, let me think about the best way to approach this... 🤔",
      "Great question! Let me put together something helpful... 💡",
      "Interesting! Let me craft something perfect for you... ✨",
    ],
    clarification: [
      "Just to make sure I help you best - did you mean {option1} or {option2}? 🔍",
      "Quick question to make this perfect for you: {question}? 💭",
      "I want to get this just right for you, {name}. Can you tell me more about {aspect}? 🎯",
    ],
    smallTalk: [
      "By the way, {name}, how are you feeling about your learning journey so far? 💙",
      "Random thought: you've come a long way since we started! Notice any changes in how you think about {topic}? 🌱",
      "Just curious, {name} - what's been the most interesting thing you've learned recently? 🔍",
    ],
  },

  // ============ SIGN-OFFS ============
  signOff: {
    sessionEnd: [
      "Great session, {name}! You made real progress today. Rest up, and I'll see you next time! 👋",
      "That's a wrap! {name}, you did amazing. Take care and come back soon! 🌟",
      "Session complete! You're one step closer to mastery. Have a great day/night! ✨",
    ],
    encourageReturn: [
      "Can't wait to see what you learn next time, {name}! 🚀",
      "Your brain is going to process all this while you're away. See you soon! 🧠",
      "Until next time, {name}! Remember - every session counts! 💪",
    ],
  },
};

// Mood detection patterns
const MOOD_PATTERNS = {
  frustrated: [
    /i (don't|dont) (get|understand)/i,
    /this (is|makes) (no|doesn't make) sense/i,
    /i('m| am) (stuck|confused|lost)/i,
    /why (isn't|isnt|won't|wont) this work/i,
    /ugh|argh|grr/i,
    /i (hate|can't stand)/i,
    /this is (hard|difficult|impossible)/i,
    /i (give|giving) up/i,
    /frustrated|frustrating/i,
  ],
  excited: [
    /i (love|like) this/i,
    /this is (cool|awesome|amazing|great)/i,
    /wow|whoa|omg/i,
    /!{2,}/,
    /excited|exciting/i,
    /can('t| not) wait/i,
    /let's (go|do this)/i,
  ],
  uncertain: [
    /i('m| am) not sure/i,
    /where (do|should) i start/i,
    /what should i/i,
    /help me (choose|decide|pick)/i,
    /confused about (where|what|how)/i,
    /don't know (where|what|how)/i,
    /\?{2,}/,
  ],
  proud: [
    /i (did|made) it/i,
    /finally/i,
    /i (understand|get it) now/i,
    /that (was|wasn't) (so|too) (hard|bad)/i,
    /nailed it/i,
    /got it/i,
  ],
};

export interface CompanionContext {
  userId: string;
  userName: string;
  currentTopic?: string;
  currentProgress?: number;
  streak?: number;
  isFirstTime?: boolean;
  recentStruggle?: boolean;
  timeSinceLastVisit?: number; // in hours
  sessionDuration?: number; // in minutes
  consecutiveFailures?: number;
  mood?: 'neutral' | 'frustrated' | 'excited' | 'uncertain' | 'proud';
}

export interface CompanionResponse {
  message: string;
  mood: string;
  suggestions?: string[];
  shouldShowBreakPrompt?: boolean;
}

@Injectable()
export class CompanionService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
  ) {}

  /**
   * Get a personalized greeting based on context
   */
  getGreeting(context: CompanionContext): CompanionResponse {
    const hour = new Date().getHours();
    let timeOfDay: 'morning' | 'afternoon' | 'evening';
    
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else timeOfDay = 'evening';

    let messagePool: string[];
    
    if (context.isFirstTime) {
      messagePool = MESSAGE_TEMPLATES.greetings.firstTime;
    } else if (context.streak && context.streak >= 3) {
      messagePool = MESSAGE_TEMPLATES.greetings.streak;
    } else if (context.timeSinceLastVisit && context.timeSinceLastVisit > 48) {
      messagePool = MESSAGE_TEMPLATES.greetings.returning;
    } else {
      messagePool = MESSAGE_TEMPLATES.greetings[timeOfDay];
    }

    const message = this.selectAndPersonalize(messagePool, context);
    
    return {
      message,
      mood: 'welcoming',
      suggestions: this.getSuggestions(context),
    };
  }

  /**
   * Get progress encouragement based on completion percentage
   */
  getProgressMessage(context: CompanionContext): CompanionResponse {
    const progress = context.currentProgress || 0;
    let messagePool: string[];
    let mood: string;

    if (progress === 0) {
      messagePool = MESSAGE_TEMPLATES.progress.started;
      mood = 'encouraging';
    } else if (progress < 30) {
      messagePool = MESSAGE_TEMPLATES.progress.quarter;
      mood = 'encouraging';
    } else if (progress < 55) {
      messagePool = MESSAGE_TEMPLATES.progress.halfway;
      mood = 'celebratory';
    } else if (progress < 80) {
      messagePool = MESSAGE_TEMPLATES.progress.threeQuarter;
      mood = 'excited';
    } else if (progress < 100) {
      messagePool = MESSAGE_TEMPLATES.progress.almostDone;
      mood = 'excited';
    } else {
      messagePool = MESSAGE_TEMPLATES.progress.completed;
      mood = 'celebratory';
    }

    return {
      message: this.selectAndPersonalize(messagePool, context),
      mood,
    };
  }

  /**
   * Get support message when user is struggling
   */
  getStruggleSupport(context: CompanionContext): CompanionResponse {
    let messagePool: string[];
    
    if (context.consecutiveFailures && context.consecutiveFailures >= 3) {
      messagePool = MESSAGE_TEMPLATES.struggle.multipleFails;
    } else if (context.recentStruggle) {
      messagePool = MESSAGE_TEMPLATES.struggle.afterFail;
    } else {
      messagePool = MESSAGE_TEMPLATES.struggle.detected;
    }

    return {
      message: this.selectAndPersonalize(messagePool, context),
      mood: 'supportive',
      shouldShowBreakPrompt: (context.consecutiveFailures || 0) >= 5,
    };
  }

  /**
   * Get celebration message for achievements
   */
  getCelebration(
    type: 'quickWin' | 'streakMilestone' | 'newSkill' | 'personalBest' | 'moduleComplete',
    context: CompanionContext,
    extra?: { skill?: string },
  ): CompanionResponse {
    let messagePool: string[];
    
    if (type === 'quickWin') {
      messagePool = MESSAGE_TEMPLATES.celebration.quickWin;
    } else if (type === 'moduleComplete') {
      messagePool = MESSAGE_TEMPLATES.progress.moduleComplete;
    } else {
      messagePool = MESSAGE_TEMPLATES.celebration[type];
    }

    const contextWithExtra = {
      ...context,
      skill: extra?.skill || context.currentTopic,
    };

    return {
      message: this.selectAndPersonalize(messagePool, contextWithExtra),
      mood: 'celebratory',
    };
  }

  /**
   * Get emotional response based on detected mood
   */
  getEmotionalResponse(context: CompanionContext): CompanionResponse {
    const mood = context.mood || 'neutral';
    
    if (mood === 'neutral') {
      return {
        message: '',
        mood: 'neutral',
      };
    }

    const messagePool = MESSAGE_TEMPLATES.emotional[mood];
    
    return {
      message: this.selectAndPersonalize(messagePool, context),
      mood: mood === 'frustrated' ? 'supportive' : mood === 'excited' ? 'excited' : 'understanding',
    };
  }

  /**
   * Detect user mood from their message
   */
  detectMood(userMessage: string): CompanionContext['mood'] {
    for (const [mood, patterns] of Object.entries(MOOD_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(userMessage)) {
          return mood as CompanionContext['mood'];
        }
      }
    }
    return 'neutral';
  }

  /**
   * Get a nudge message for re-engagement
   */
  getNudge(
    type: 'idle' | 'suggestion' | 'reviewReminder',
    context: CompanionContext,
    extra?: { suggestion?: string },
  ): CompanionResponse {
    const messagePool = MESSAGE_TEMPLATES.nudges[type];
    
    const contextWithExtra = {
      ...context,
      suggestion: extra?.suggestion || 'something new',
      topic: context.currentTopic || 'your studies',
    };

    return {
      message: this.selectAndPersonalize(messagePool, contextWithExtra),
      mood: 'encouraging',
    };
  }

  /**
   * Get sign-off message
   */
  getSignOff(context: CompanionContext, encourageReturn: boolean = true): CompanionResponse {
    const messagePool = encourageReturn
      ? [...MESSAGE_TEMPLATES.signOff.sessionEnd, ...MESSAGE_TEMPLATES.signOff.encourageReturn]
      : MESSAGE_TEMPLATES.signOff.sessionEnd;

    return {
      message: this.selectAndPersonalize(messagePool, context),
      mood: 'warm',
    };
  }

  /**
   * Get conversational acknowledgment
   */
  getAcknowledgment(type: 'acknowledgment' | 'thinking' | 'smallTalk'): string {
    const messagePool = MESSAGE_TEMPLATES.conversation[type];
    return messagePool[Math.floor(Math.random() * messagePool.length)];
  }

  /**
   * Transform AI response to be more companion-like
   */
  transformToCompanionVoice(
    response: string,
    context: CompanionContext,
  ): string {
    // Add personal touches
    let transformed = response;

    // Occasionally add the user's name (not every sentence)
    if (Math.random() < 0.3 && context.userName) {
      const sentences = transformed.split('. ');
      if (sentences.length > 2) {
        const insertIndex = Math.floor(Math.random() * (sentences.length - 1)) + 1;
        sentences[insertIndex] = `${context.userName}, ${sentences[insertIndex].toLowerCase()}`;
        transformed = sentences.join('. ');
      }
    }

    // Add encouraging emoji at the end sometimes
    if (Math.random() < 0.4 && !transformed.match(/[🎉✨🌟💪🚀🎯]/)) {
      const emojis = ['✨', '🎯', '💡', '🌟'];
      transformed += ` ${emojis[Math.floor(Math.random() * emojis.length)]}`;
    }

    return transformed;
  }

  /**
   * Generate system prompt addition for companion personality
   */
  getCompanionSystemPrompt(context: CompanionContext): string {
    return `
You are Flexi, a warm and encouraging learning companion. Your personality:

CORE TRAITS:
- Warm, patient, and genuinely enthusiastic about helping ${context.userName || 'the learner'}
- Conversational and friendly, never robotic or formal
- Encouraging without being patronizing
- Curious and engaged - you find learning genuinely exciting

COMMUNICATION STYLE:
- Use "we" and "let's" to create partnership feeling
- Address the learner by name occasionally (but not every sentence)
- Use casual language - contractions, friendly phrases
- Add appropriate emojis sparingly (1-2 per response max)
- Celebrate small wins genuinely
- When explaining difficult concepts, use analogies and relate to things they might know
- If they're struggling, acknowledge it's hard and offer alternative approaches

AVOID:
- Sounding like a textbook or formal instructor
- Excessive praise that feels insincere
- Overwhelming with information
- Making the learner feel bad about mistakes
- Using jargon without explanation

CURRENT CONTEXT:
- Learner: ${context.userName || 'Friend'}
- Topic: ${context.currentTopic || 'Not specified'}
- Progress: ${context.currentProgress || 0}%
- Learning streak: ${context.streak || 0} days
${context.recentStruggle ? '- Note: Learner recently struggled - be extra supportive' : ''}
${context.consecutiveFailures && context.consecutiveFailures > 2 ? '- Note: Multiple failed attempts - consider suggesting a break or simpler approach' : ''}

Remember: You're a friend helping them learn, not a teacher grading them.
`;
  }

  // ============ PRIVATE HELPERS ============

  private selectAndPersonalize(pool: string[], context: CompanionContext & Record<string, any>): string {
    const template = pool[Math.floor(Math.random() * pool.length)];
    
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (key === 'name') return context.userName || 'friend';
      if (key === 'topic') return context.currentTopic || 'your studies';
      if (key === 'streak') return String(context.streak || 0);
      if (key === 'skill') return context.skill || context.currentTopic || 'this skill';
      if (key === 'suggestion') return context.suggestion || 'something new';
      if (key === 'progress') return String(context.currentProgress || 0);
      return context[key] || match;
    });
  }

  private getSuggestions(context: CompanionContext): string[] {
    const suggestions: string[] = [];
    
    if (context.currentTopic) {
      suggestions.push(`Continue with ${context.currentTopic}`);
    }
    
    if (!context.isFirstTime) {
      suggestions.push('Review recent progress');
    }
    
    suggestions.push('Explore something new');
    
    return suggestions;
  }

  /**
   * Calculate user context from database
   */
  async getUserContext(userId: string): Promise<CompanionContext> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['sessions'],
    });

    if (!user) {
      return {
        userId,
        userName: 'friend',
        isFirstTime: true,
      };
    }

    // Calculate streak
    const sessions = await this.sessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    let streak = 0;
    if (sessions.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        
        const hasSession = sessions.some(s => {
          const sessionDate = new Date(s.createdAt);
          sessionDate.setHours(0, 0, 0, 0);
          return sessionDate.getTime() === checkDate.getTime();
        });
        
        if (hasSession) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }
    }

    // Calculate time since last visit
    let timeSinceLastVisit = 0;
    if (sessions.length > 0) {
      const lastSession = sessions[0];
      timeSinceLastVisit = (Date.now() - new Date(lastSession.createdAt).getTime()) / (1000 * 60 * 60);
    }

    return {
      userId,
      userName: user.name || user.email.split('@')[0],
      streak,
      isFirstTime: sessions.length === 0,
      timeSinceLastVisit,
    };
  }
}
