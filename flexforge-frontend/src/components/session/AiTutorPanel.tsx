import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, Loader2, Bot, User, Lightbulb } from 'lucide-react';
import { Button } from '@/components/common';
import { clsx } from 'clsx';
import { sessionService } from '@/services/sessionService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AiTutorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  dayNumber: number;
  context: {
    taskTitle?: string;
    taskDescription?: string;
    currentCode?: string;
    concept?: string;
  };
}

const QUICK_PROMPTS = [
  { label: "I'm stuck", prompt: "I'm stuck on this task. Can you give me a hint without giving away the answer?" },
  { label: "Explain concept", prompt: "Can you explain the main concept behind this task in simpler terms?" },
  { label: "Why isn't this working?", prompt: "My code isn't working as expected. Can you help me understand why?" },
];

export function AiTutorPanel({ isOpen, onClose, sessionId, dayNumber, context }: AiTutorPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Add welcome message when first opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hey! I'm here to help you with "${context.taskTitle || 'this task'}". I won't give you the answer directly, but I'll guide you to understand the concepts better. What's on your mind?`,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, context.taskTitle]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await sessionService.askAiTutor(sessionId, {
        message: text,
        dayNumber,
        context: {
          taskTitle: context.taskTitle,
          taskDescription: context.taskDescription,
          currentCode: context.currentCode,
          concept: context.concept,
        },
        conversationHistory,
      });

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI Tutor error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Sorry, I ran into an issue. Let's try again in a moment.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
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
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-violet-500 to-purple-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">AI Tutor</h2>
                  <p className="text-xs text-white/80">Here to guide, not to solve</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx(
                    'flex gap-3',
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  )}
                >
                  {/* Avatar */}
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    message.role === 'assistant'
                      ? 'bg-gradient-to-br from-violet-500 to-purple-600'
                      : 'bg-gray-200'
                  )}>
                    {message.role === 'assistant' ? (
                      <Bot className="w-4 h-4 text-white" />
                    ) : (
                      <User className="w-4 h-4 text-gray-600" />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div className={clsx(
                    'max-w-[80%] rounded-2xl px-4 py-2.5',
                    message.role === 'assistant'
                      ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                      : 'bg-violet-500 text-white rounded-tr-sm'
                  )}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </motion.div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                      <span className="text-sm text-gray-500">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick prompts */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2">
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" />
                  Quick questions
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.label}
                      onClick={() => handleSend(prompt.prompt)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-xs bg-violet-50 text-violet-700 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything about this task..."
                    rows={1}
                    className={clsx(
                      'w-full px-4 py-2.5 pr-12 bg-white border border-gray-300 rounded-xl resize-none',
                      'text-sm text-gray-900 placeholder-gray-400',
                      'focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
                      'transition-all duration-200'
                    )}
                    style={{ minHeight: '44px', maxHeight: '120px' }}
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="bg-violet-500 hover:bg-violet-600 rounded-xl px-4"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
