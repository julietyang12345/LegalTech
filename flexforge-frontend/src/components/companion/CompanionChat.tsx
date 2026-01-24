import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useCompanionStore } from '@/stores/companionStore';

// Companion avatar with mood gradients
function CompanionAvatar({ mood, size = 'md' }: { mood: string; size?: 'sm' | 'md' | 'lg' }) {
  const gradients: Record<string, string> = {
    welcoming: 'from-focus-400 to-teal-400',
    encouraging: 'from-alert-400 to-yellow-400',
    celebratory: 'from-pink-400 to-purple-400',
    supportive: 'from-cyan-400 to-blue-400',
    focused: 'from-focus-500 to-emerald-500',
  };

  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-lg',
    lg: 'w-14 h-14 text-2xl',
  };

  return (
    <div
      className={clsx(
        'rounded-full bg-gradient-to-br flex items-center justify-center',
        gradients[mood] || gradients.welcoming,
        sizes[size]
      )}
    >
      <span>🦊</span>
    </div>
  );
}

// Typing indicator dots
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <CompanionAvatar mood="focused" size="sm" />
      <div className="flex items-center gap-1 ml-2 px-3 py-2 bg-gray-100 rounded-2xl">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  );
}

// Chat message bubble
function ChatMessage({ message }: { message: { content: string; mood: string; isUser: boolean; timestamp: string } }) {
  return (
    <div
      className={clsx(
        'flex items-end gap-2 px-4 py-1',
        message.isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {!message.isUser && <CompanionAvatar mood={message.mood} size="sm" />}
      <div
        className={clsx(
          'max-w-[80%] px-4 py-2 rounded-2xl',
          message.isUser
            ? 'bg-brand-500 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

// Quick action buttons
function QuickActions() {
  const { quickActions, executeQuickAction } = useCompanionStore();

  return (
    <div className="flex flex-wrap sm:flex-nowrap gap-2 px-4 py-2 border-t border-gray-100 sm:overflow-x-auto no-scrollbar">
      {quickActions.map((action) => (
        <button
          key={action.id}
          onClick={() => executeQuickAction(action.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 
                     rounded-full text-sm text-gray-700 whitespace-nowrap transition-colors"
        >
          <span>{action.emoji}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

// Main chat window
export function CompanionChat() {
  const {
    messages,
    isOpen,
    isTyping,
    currentMood,
    closeChat,
    sendMessage,
  } = useCompanionStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-24 right-4 w-[calc(100vw-2rem)] max-w-96 max-h-[500px] bg-white rounded-2xl shadow-companion
                     flex flex-col overflow-hidden z-40 sm:right-6 sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-500 to-brand-600">
            <div className="flex items-center gap-3">
              <CompanionAvatar mood={currentMood} size="md" />
              <div>
                <h3 className="font-semibold text-white">Flexi</h3>
                <p className="text-xs text-white/80">Your learning companion</p>
              </div>
            </div>
            <button
              onClick={closeChat}
              className="p-1 text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-4 space-y-2 scrollbar-thin">
            {messages.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Sparkles className="w-12 h-12 mx-auto text-brand-300 mb-3" />
                <p className="text-gray-600 text-sm">
                  Hi! I'm Flexi, your learning companion. 
                  Ask me anything or use the quick actions below!
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          <QuickActions />

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Flexi anything..."
              className="flex-1 px-4 py-2 bg-gray-100 rounded-full text-sm 
                       placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 bg-brand-500 text-white rounded-full 
                       hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Floating bubble button
export function CompanionBubble() {
  const { isOpen, toggleChat, hasUnread, currentMood } = useCompanionStore();

  return (
    <motion.button
      onClick={toggleChat}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className={clsx(
        'fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg',
        'flex items-center justify-center z-40',
        'bg-gradient-to-br from-brand-500 to-brand-600',
        'transition-transform duration-200'
      )}
    >
      <CompanionAvatar mood={currentMood} size="lg" />
      
      {/* Unread indicator */}
      {hasUnread && !isOpen && (
        <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full 
                        flex items-center justify-center text-[10px] text-white font-bold
                        animate-bounce-soft">
          !
        </span>
      )}
    </motion.button>
  );
}
