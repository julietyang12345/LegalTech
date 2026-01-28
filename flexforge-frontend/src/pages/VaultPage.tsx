import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Search,
  Bookmark,
  Code,
  FileText,
  Brain,
  Crown,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, Input } from '@/components/common';
import { QuotaTier } from '@/types';

// Tab types
type VaultTab = 'summaries' | 'bookmarks' | 'code' | 'reflections' | 'review';

// Tab component
function TabButton({
  tab,
  activeTab,
  icon: Icon,
  label,
  onClick,
}: {
  tab: VaultTab;
  activeTab: VaultTab;
  icon: typeof BookOpen;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        activeTab === tab
          ? 'bg-brand-100 text-brand-700'
          : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// Paywall component
function ProPaywall() {
  return (
    <Card className="p-8 text-center bg-gradient-to-br from-brand-50 to-purple-50">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 
                     flex items-center justify-center">
        <Crown className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Unlock The Vault</h2>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        The Vault is your personal knowledge base with AI-summarized transcripts, 
        saved code snippets, and spaced repetition review.
      </p>
      <div className="space-y-2 text-left max-w-xs mx-auto mb-6">
        {[
          'AI-summarized video transcripts',
          'Bookmarked video moments',
          'Saved code snippets',
          'Past reflections & notes',
          'Spaced repetition review queue',
        ].map((feature, i) => (
          <div key={i} className="flex items-center gap-2 text-gray-700">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            {feature}
          </div>
        ))}
      </div>
      <Button>
        Upgrade to PRO - $15/mo
      </Button>
    </Card>
  );
}

// Mock summary item
function SummaryItem({ title, date, topic }: { title: string; date: string; topic: string }) {
  return (
    <Card variant="hover" className="p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
          <FileText className="w-5 h-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{title}</h3>
          <p className="text-sm text-gray-500">{topic} • {date}</p>
        </div>
        <Button variant="ghost" size="sm">
          View
        </Button>
      </div>
    </Card>
  );
}

// Mock code snippet
function CodeSnippetItem({ title, language, preview }: { title: string; language: string; preview: string }) {
  return (
    <Card variant="hover" className="overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">{title}</h3>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
            {language}
          </span>
        </div>
      </div>
      <pre className="p-4 bg-gray-900 text-gray-100 text-sm overflow-x-auto">
        <code>{preview}</code>
      </pre>
    </Card>
  );
}

// Review queue item
function ReviewItem({ topic, lastReviewed, confidence }: { topic: string; lastReviewed: string; confidence: number }) {
  const confidenceColors = {
    1: 'bg-red-100 text-red-700',
    2: 'bg-orange-100 text-orange-700',
    3: 'bg-yellow-100 text-yellow-700',
    4: 'bg-green-100 text-green-700',
    5: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <Card variant="hover" className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-brand-500" />
          <div>
            <h3 className="font-medium text-gray-900">{topic}</h3>
            <p className="text-sm text-gray-500">Last reviewed: {lastReviewed}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={clsx(
            'px-2 py-0.5 text-xs font-medium rounded-full',
            confidenceColors[confidence as keyof typeof confidenceColors]
          )}>
            {confidence}/5
          </span>
          <Button size="sm">Review</Button>
        </div>
      </div>
    </Card>
  );
}

export function VaultPage() {
  const { hasTierAccess } = useAuthStore();
  const [activeTab, setActiveTab] = useState<VaultTab>('summaries');
  const [searchQuery, setSearchQuery] = useState('');

  const hasAccess = hasTierAccess(QuotaTier.PRO);

  if (!hasAccess) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <ProPaywall />
      </div>
    );
  }

  // Mock data
  const summaries = [
    { title: 'Day 1: Introduction to Variables', date: '2 days ago', topic: 'Python Basics' },
    { title: 'Day 2: Functions and Parameters', date: '1 day ago', topic: 'Python Basics' },
    { title: 'Day 3: Working with Loops', date: 'Today', topic: 'Python Basics' },
  ];

  const codeSnippets = [
    { title: 'Hello World Function', language: 'Python', preview: 'def hello(name):\n    return f"Hello, {name}!"' },
    { title: 'Loop Example', language: 'Python', preview: 'for i in range(5):\n    print(i)' },
  ];

  const reviewQueue = [
    { topic: 'Variables and Data Types', lastReviewed: '3 days ago', confidence: 3 },
    { topic: 'Function Parameters', lastReviewed: '1 day ago', confidence: 4 },
    { topic: 'For Loops vs While Loops', lastReviewed: '5 days ago', confidence: 2 },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">The Vault</h1>
        <p className="text-gray-600">
          Your personal knowledge base. Everything you've learned, organized and ready to review.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search your vault..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <TabButton
          tab="summaries"
          activeTab={activeTab}
          icon={FileText}
          label="Summaries"
          onClick={() => setActiveTab('summaries')}
        />
        <TabButton
          tab="bookmarks"
          activeTab={activeTab}
          icon={Bookmark}
          label="Bookmarks"
          onClick={() => setActiveTab('bookmarks')}
        />
        <TabButton
          tab="code"
          activeTab={activeTab}
          icon={Code}
          label="Code Snippets"
          onClick={() => setActiveTab('code')}
        />
        <TabButton
          tab="reflections"
          activeTab={activeTab}
          icon={BookOpen}
          label="Reflections"
          onClick={() => setActiveTab('reflections')}
        />
        <TabButton
          tab="review"
          activeTab={activeTab}
          icon={Brain}
          label="Review Queue"
          onClick={() => setActiveTab('review')}
        />
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        {activeTab === 'summaries' && (
          <>
            {summaries.map((summary, i) => (
              <SummaryItem key={i} {...summary} />
            ))}
          </>
        )}

        {activeTab === 'bookmarks' && (
          <Card className="p-8 text-center">
            <Bookmark className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No bookmarks yet</h3>
            <p className="text-gray-600">
              Bookmark video moments during your sessions to save them here.
            </p>
          </Card>
        )}

        {activeTab === 'code' && (
          <>
            {codeSnippets.map((snippet, i) => (
              <CodeSnippetItem key={i} {...snippet} />
            ))}
          </>
        )}

        {activeTab === 'reflections' && (
          <Card className="p-8 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Your reflections</h3>
            <p className="text-gray-600">
              Your daily reflections from completed sessions will appear here.
            </p>
          </Card>
        )}

        {activeTab === 'review' && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-amber-800 text-sm">
                <strong>3 topics</strong> due for review based on spaced repetition schedule.
              </p>
            </div>
            {reviewQueue.map((item, i) => (
              <ReviewItem key={i} {...item} />
            ))}
          </>
        )}
      </motion.div>
    </div>
  );
}
