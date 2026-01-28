import { create } from 'zustand';
import type { CompanionMessage } from '@/types';
import { companionService } from '@/services/companionService';

type CompanionMood = 'welcoming' | 'encouraging' | 'celebratory' | 'supportive' | 'focused';

interface CompanionState {
  // Chat state
  messages: CompanionMessage[];
  isOpen: boolean;
  isTyping: boolean;
  currentMood: CompanionMood;
  
  // Quick actions
  quickActions: Array<{
    id: string;
    label: string;
    emoji: string;
    action: string;
  }>;

  // Unread indicator
  hasUnread: boolean;

  // Actions
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  sendMessage: (content: string, context?: { sessionId?: string; currentTopic?: string }) => Promise<void>;
  addSystemMessage: (content: string, mood?: CompanionMood) => void;
  clearMessages: () => void;
  setMood: (mood: CompanionMood) => void;
  markAsRead: () => void;

  // Celebrations & encouragements
  celebrate: (type: 'taskComplete' | 'dayComplete' | 'streakMilestone' | 'bossComplete') => void;
  encourage: (situation: 'stuck' | 'struggling' | 'returning') => void;

  // Quick actions
  loadQuickActions: (context: { sessionId?: string; currentStep?: string }) => Promise<void>;
  executeQuickAction: (actionId: string) => void;
}

const CELEBRATION_MESSAGES: Record<string, { content: string; mood: CompanionMood }[]> = {
  taskComplete: [
    { content: "Nice work! 🎉 You're making great progress!", mood: 'celebratory' },
    { content: "Boom! Task complete! You're on fire! 🔥", mood: 'celebratory' },
    { content: "That's the way! Keep that momentum going! 💪", mood: 'encouraging' },
  ],
  dayComplete: [
    { content: "Incredible! You finished the whole day! 🏆 Take a moment to feel proud!", mood: 'celebratory' },
    { content: "Day complete! You showed up and did the work. That's what matters! ✨", mood: 'celebratory' },
  ],
  streakMilestone: [
    { content: "🔥 Your streak is on fire! Consistency is your superpower!", mood: 'celebratory' },
    { content: "Look at you go! Every day you show up, you level up! 🚀", mood: 'encouraging' },
  ],
  bossComplete: [
    { content: "🏆 BOSS PROJECT COMPLETE! You just proved you can build real things! This is HUGE!", mood: 'celebratory' },
    { content: "You did it! This project goes straight to your portfolio! 🎉✨", mood: 'celebratory' },
  ],
};

const ENCOURAGEMENT_MESSAGES: Record<string, { content: string; mood: CompanionMood }[]> = {
  stuck: [
    { content: "I noticed you might be stuck. That's totally normal! Want a hint? 💡", mood: 'supportive' },
    { content: "Taking a while? No worries! Sometimes the best breakthroughs come after struggle. 🌟", mood: 'supportive' },
  ],
  struggling: [
    { content: "Learning is supposed to feel hard sometimes. You've got this! 💪", mood: 'supportive' },
    { content: "Remember: every expert was once a beginner. Keep going! 🌱", mood: 'encouraging' },
  ],
  returning: [
    { content: "Welcome back! 👋 Life happens. What matters is you're here now!", mood: 'welcoming' },
    { content: "Hey! Great to see you again! Ready to pick up where we left off? 😊", mood: 'welcoming' },
  ],
};

export const useCompanionStore = create<CompanionState>((set, get) => ({
  messages: [],
  isOpen: false,
  isTyping: false,
  currentMood: 'welcoming',
  quickActions: [
    { id: 'stuck', label: 'Stuck', emoji: '💡', action: 'help_stuck' },
    { id: 'progress', label: 'Progress', emoji: '📊', action: 'show_progress' },
    { id: 'break', label: 'Break', emoji: '☕', action: 'take_break' },
    { id: 'great', label: 'Great!', emoji: '❤️', action: 'feeling_great' },
  ],
  hasUnread: false,

  toggleChat: () => set((state) => ({ 
    isOpen: !state.isOpen,
    hasUnread: state.isOpen ? state.hasUnread : false,
  })),
  
  openChat: () => set({ isOpen: true, hasUnread: false }),
  
  closeChat: () => set({ isOpen: false }),

  sendMessage: async (content, context) => {
    const userMessage: CompanionMessage = {
      id: `user-${Date.now()}`,
      content,
      mood: 'focused',
      timestamp: new Date().toISOString(),
      isUser: true,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
    }));

    try {
      const response = await companionService.chat(content, context);
      
      const companionMessage: CompanionMessage = {
        id: `companion-${Date.now()}`,
        content: response.response.content,
        mood: response.response.mood as CompanionMood,
        timestamp: new Date().toISOString(),
        isUser: false,
      };

      set((state) => ({
        messages: [...state.messages, companionMessage],
        isTyping: false,
        currentMood: response.response.mood as CompanionMood,
      }));
    } catch (_error) {
      set((state) => ({
        messages: [...state.messages, {
          id: `error-${Date.now()}`,
          content: "Oops! I couldn't respond right now. Try again in a moment! 😅",
          mood: 'supportive' as CompanionMood,
          timestamp: new Date().toISOString(),
          isUser: false,
        }],
        isTyping: false,
      }));
    }
  },

  addSystemMessage: (content, mood = 'encouraging') => {
    const message: CompanionMessage = {
      id: `system-${Date.now()}`,
      content,
      mood,
      timestamp: new Date().toISOString(),
      isUser: false,
    };

    set((state) => ({
      messages: [...state.messages, message],
      currentMood: mood,
      hasUnread: !state.isOpen,
    }));
  },

  clearMessages: () => set({ messages: [] }),

  setMood: (mood) => set({ currentMood: mood }),

  markAsRead: () => set({ hasUnread: false }),

  celebrate: (type) => {
    const messages = CELEBRATION_MESSAGES[type];
    if (!messages?.length) return;
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    get().addSystemMessage(randomMessage.content, randomMessage.mood);
  },

  encourage: (situation) => {
    const messages = ENCOURAGEMENT_MESSAGES[situation];
    if (!messages?.length) return;
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    get().addSystemMessage(randomMessage.content, randomMessage.mood);
  },

  loadQuickActions: async (context) => {
    try {
      const response = await companionService.getQuickActions(context);
      set({ quickActions: response.actions });
    } catch (_error) {
      // Keep default actions
    }
  },

  executeQuickAction: (actionId) => {
    const action = get().quickActions.find(a => a.id === actionId);
    if (!action) return;

    switch (action.action) {
      case 'help_stuck':
        get().sendMessage("I'm stuck and need help!");
        break;
      case 'show_progress':
        get().sendMessage("How am I doing?");
        break;
      case 'take_break':
        get().addSystemMessage("Taking a break is smart! Your brain consolidates learning during rest. See you soon! ☕", 'supportive');
        break;
      case 'feeling_great':
        get().addSystemMessage("That's awesome to hear! Your positive energy will carry you far! 🚀", 'celebratory');
        break;
    }
  },
}));
