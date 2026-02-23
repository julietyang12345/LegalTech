import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, Loader2, Bot, User, Lightbulb } from 'lucide-react';
import { Button } from '@/components/common';
import { clsx } from 'clsx';
import { useRepsStore } from '@/stores/repsStore';

interface RepCoachChatProps {
  isOpen: boolean;
  onClose: () => void;
  scenarioTitle: string;
}

const QUICK_PROMPTS = [
  { label: 'Where do I start?', prompt: "I'm looking at this scenario and not sure where to begin. Can you help me break down my first step?" },
  { label: 'Is my approach right?', prompt: "I've started working on this but I'm not sure if my approach is correct. Can you check my thinking?" },
  { label: 'What tool should I use?', prompt: "I'm not sure what tool, library, or technique I should use for this task. Can you point me in the right direction?" },
];

export function RepCoachChat({ isOpen, onClose, scenarioTitle }: RepCoachChatProps) {
  const { coachMessages, isCoachLoading, sendCoachMessage } = useRepsStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [coachMessages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isCoachLoading) return;
    setInput('');
    await sendCoachMessage(text);
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-surface shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-emerald-500 to-teal-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">Rep Coach</h2>
                  <p className="text-xs text-white/80">Guides you through the scenario</p>
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
              {/* Welcome message */}
              {coachMessages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 bg-surface-tertiary text-content">
                    <p className="text-sm leading-relaxed">
                      Hey! I'm your coach for "{scenarioTitle}". I'll help you think through the problem — ask me anything about approach, tools, or concepts. I won't give you the answer, but I'll make sure you're on the right track.
                    </p>
                  </div>
                </motion.div>
              )}

              {coachMessages.map((message, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx(
                    'flex gap-3',
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  )}
                >
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    message.role === 'assistant'
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                      : 'bg-surface-tertiary'
                  )}>
                    {message.role === 'assistant' ? (
                      <Bot className="w-4 h-4 text-white" />
                    ) : (
                      <User className="w-4 h-4 text-content-secondary" />
                    )}
                  </div>
                  <div className={clsx(
                    'max-w-[80%] rounded-2xl px-4 py-2.5',
                    message.role === 'assistant'
                      ? 'bg-surface-tertiary text-content rounded-tl-sm'
                      : 'bg-emerald-500 text-white rounded-tr-sm'
                  )}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </motion.div>
              ))}

              {isCoachLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-surface-tertiary rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      <span className="text-sm text-content-tertiary">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick prompts */}
            {coachMessages.length === 0 && (
              <div className="px-4 pb-2">
                <p className="text-xs text-content-tertiary mb-2 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" />
                  Quick questions
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.label}
                      onClick={() => handleSend(prompt.prompt)}
                      disabled={isCoachLoading}
                      className="px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100 transition-colors disabled:opacity-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-border bg-surface-secondary">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask your coach anything..."
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl resize-none
                             text-base text-content placeholder-content-tertiary
                             focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
                             transition-all duration-200"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isCoachLoading}
                  className="bg-emerald-500 hover:bg-emerald-600 rounded-xl px-4"
                >
                  {isCoachLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <button
                onClick={onClose}
                className="w-full mt-3 py-2.5 text-sm text-content-secondary bg-surface-tertiary rounded-xl hover:bg-border transition-colors md:hidden"
              >
                Close Coach
              </button>
              <p className="text-xs text-content-tertiary mt-2 text-center hidden md:block">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
