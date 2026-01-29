import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Clock, CheckCircle2, MessageCircle, Lock, Youtube, RefreshCw, Loader2, BookOpen, Video, Sparkles, Info, ChevronDown, ChevronUp, FileText, Zap } from 'lucide-react';
import { Card, Button } from '@/components/common';
import { StepLayout } from './StepLayout';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { sessionService } from '@/services/sessionService';
import { QuotaTier, ContentMode } from '@/types';
import type { CurriculumDay, Session, VideoMatch, VideoAlternative, VideoContentType } from '@/types';

interface VideoStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

// Parse time string "3:20" to seconds
function parseTimeToSeconds(t: string | undefined): number {
  if (!t) return 0;
  const parts = t.split(':').map(n => parseInt(n, 10));
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// Build proper YouTube embed URL from videoId
function buildEmbedUrl(video: VideoMatch | VideoAlternative | null): string {
  if (!video?.videoId) return '';

  const startSeconds = parseTimeToSeconds(video.startTime);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
  });

  if (origin) params.set('origin', origin);
  if (startSeconds > 0) params.set('start', String(startSeconds));

  return `https://www.youtube.com/embed/${video.videoId}?${params.toString()}`;
}

// Content type badge component
function ContentTypeBadge({ contentType }: { contentType?: VideoContentType }) {
  if (!contentType) return null;

  const { type, toolsMentioned } = contentType;

  if (type === 'CONCEPT') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
        <span>🎯</span>
        <span>Concept-focused</span>
      </span>
    );
  }

  if (type === 'TOOL_SPECIFIC') {
    const toolName = toolsMentioned?.[0] || 'Tool';
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full border border-amber-200">
        <span>🔧</span>
        <span>Tool walkthrough ({toolName})</span>
      </span>
    );
  }

  // MIXED type
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-200">
      <span>📚</span>
      <span>Mixed approach</span>
    </span>
  );
}

// Video card component - reused for main and alternative
function VideoCard({
  video,
  fallbackTitle,
  isAlternative = false,
  onSelect,
  isActive = false,
}: {
  video: VideoMatch | VideoAlternative | null;
  fallbackTitle: string;
  isAlternative?: boolean;
  onSelect?: () => void;
  isActive?: boolean;
}) {
  const embedUrl = buildEmbedUrl(video);
  const _youtubeUrl = video?.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : null;

  // No video found - show minimal message without video frame
  if (!embedUrl) {
    return (
      <div className={`rounded-xl overflow-hidden ${isAlternative ? 'border-2' : ''} ${isActive ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'}`}>
        <div className="p-6">
          <div className="flex items-center gap-3 text-gray-500">
            <Info className="w-5 h-5 text-gray-400" />
            <p className="text-sm">No matching video found for this topic.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden ${isAlternative ? 'border-2' : ''} ${isActive ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'}`}>
      {/* Video embed */}
      <div className={`aspect-video bg-gray-900 relative ${isAlternative ? 'max-h-48' : ''}`}>
        <iframe
          title={video?.title || fallbackTitle}
          src={embedUrl}
          className="w-full h-full"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />

      </div>

      {/* Video source attribution */}
      <div className={`flex items-center gap-2 ${isAlternative ? 'px-4 py-2' : 'px-6 py-2'} bg-gray-50 border-b border-gray-100 text-xs text-gray-500`}>
        <Youtube className="w-4 h-4 text-red-500" />
        <span>
          Source: <span className="font-medium text-gray-700">{video?.channelName || 'YouTube'}</span> on YouTube
        </span>
      </div>

      {/* Video info */}
      <div className={isAlternative ? 'p-4' : 'p-6'}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-gray-900 ${isAlternative ? 'text-sm' : 'text-lg'} line-clamp-2`}>
              {video?.title || fallbackTitle}
            </h3>
            {video?.channelName && (
              <p className="text-xs text-gray-500 mt-1">{video.channelName}</p>
            )}
            {/* Content type badge */}
            {video?.contentType && (
              <div className="mt-2">
                <ContentTypeBadge contentType={video.contentType} />
              </div>
            )}
          </div>
          {isAlternative && onSelect && !isActive && (
            <button
              onClick={onSelect}
              className="shrink-0 px-3 py-1.5 text-sm bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-colors"
            >
              Use This
            </button>
          )}
          {isActive && (
            <span className="shrink-0 px-3 py-1.5 text-sm bg-brand-100 text-brand-700 rounded-lg font-medium">
              Selected
            </span>
          )}
        </div>

        {/* Timestamps */}
        {video?.startTime && video?.endTime && (
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
            <Clock className="w-3 h-3" />
            <span>Watch {video.startTime} → {video.endTime}</span>
          </div>
        )}

      </div>
    </div>
  );
}

// Concept card emojis based on index
const CONCEPT_EMOJIS = ['💡', '🎯', '⚡', '🔑', '✨', '🧩', '📌', '🌟'];

// Learn & Understand content - shown when no video object exists but we have foundation cards
function LearnUnderstandContent({
  day,
  onSwitchToVideo,
  showVideoOption,
}: {
  day: CurriculumDay;
  onSwitchToVideo?: () => void;
  showVideoOption: boolean;
}) {
  const [expandedCard, setExpandedCard] = useState<number | null>(0);

  const conceptCards = day.foundationCards || [];
  const objectives = day.objectives || [];

  return (
    <div className="space-y-3">
      {/* Header info card */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg shrink-0">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Learn & Understand</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Master the key concepts before practicing
              </p>
            </div>
          </div>
          {showVideoOption && onSwitchToVideo && (
            <button
              onClick={onSwitchToVideo}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              <Video className="w-3.5 h-3.5" />
              Watch video instead
            </button>
          )}
        </div>
      </Card>

      {/* Learning objectives */}
      {objectives.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">What You'll Learn</h3>
                <p className="text-sm text-gray-600">Today's learning objectives</p>
              </div>
            </div>
            <ul className="space-y-2">
              {objectives.map((objective, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="w-5 h-5 flex items-center justify-center bg-amber-100 text-amber-700 rounded-full text-xs font-medium shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Concept cards - expandable */}
      {conceptCards.length > 0 ? (
        conceptCards.map((card, index) => {
          const isExpanded = expandedCard === index;
          const emoji = CONCEPT_EMOJIS[index % CONCEPT_EMOJIS.length];

          return (
            <Card
              key={index}
              className={`transition-all duration-200 ${
                isExpanded ? 'ring-2 ring-purple-400' : ''
              }`}
            >
              {/* Card header */}
              <button
                onClick={() => setExpandedCard(isExpanded ? null : index)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{emoji}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{card.concept}</h3>
                    <p className="text-sm text-gray-500">
                      {isExpanded ? 'Click to collapse' : 'Click to expand'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isExpanded && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600">
                      {index + 1} of {conceptCards.length}
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-0">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-gray-700 leading-relaxed">{card.explanation}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </Card>
          );
        })
      ) : (
        // Fallback when no foundation cards available
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <BookOpen className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {day.title}
              </h3>
              <p className="text-gray-600 mb-4">
                Today you'll learn about {objectives.join(', ') || 'the key concepts'}.
                Continue to the interactive exercises to master these concepts step by step.
              </p>
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <Sparkles className="w-4 h-4" />
                <span>Continue to practice exercises</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// AI Explanation component - shown when AI mode is selected
// Uses expandable card format similar to ConceptCheck
function AIExplanation({
  video,
  onSwitchToVideo,
  showVideoOption,
  foundationCards,
}: {
  video: VideoMatch;
  onSwitchToVideo?: () => void;
  showVideoOption: boolean;
  foundationCards?: Array<{ concept: string; explanation: string }>;
}) {
  const [expandedCard, setExpandedCard] = useState<number | null>(0);

  const concept = video.concept || video.title || 'this concept';
  const adaptiveInfo = video.adaptiveModality;

  // Show key learning points only when video was skipped (not manually chosen AI mode)
  const wasVideoSkipped = video.videoAvailable === false;
  const keyLearningPoints = wasVideoSkipped ? video.keyLearningPoints : undefined;

  // Get cards to display - prefer AI-generated concept breakdown, fallback to foundationCards
  const conceptCards = video.aiConceptBreakdown || foundationCards || [];

  return (
    <div className="space-y-3">
      {/* Header info card */}
      {(video.reason || adaptiveInfo) && (
        <Card className="overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg shrink-0">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">AI-Curated Learning</h3>
                {video.reason && (
                  <p className="text-sm text-gray-600 mt-0.5">{video.reason}</p>
                )}
              </div>
            </div>
            {showVideoOption && onSwitchToVideo && (
              <button
                onClick={onSwitchToVideo}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Video className="w-3.5 h-3.5" />
                Watch video instead
              </button>
            )}
          </div>
        </Card>
      )}

      {/* AI Explanation - rich text explanation when video is skipped */}
      {wasVideoSkipped && video.explanation && (
        <Card className="overflow-hidden">
          <div className="p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg shrink-0">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{concept}</h3>
              </div>
            </div>
            <div className="text-gray-700 leading-relaxed whitespace-pre-line">
              {video.explanation}
            </div>
          </div>
        </Card>
      )}

      {/* Key Learning Points - only when video was skipped */}
      {keyLearningPoints && keyLearningPoints.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Key Learning Points</h3>
                <p className="text-sm text-gray-600">Focus on these core concepts</p>
              </div>
            </div>
            <ul className="space-y-2">
              {keyLearningPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="w-5 h-5 flex items-center justify-center bg-amber-100 text-amber-700 rounded-full text-xs font-medium shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Concept cards - expandable like ConceptCheck */}
      {conceptCards.length > 0 ? (
        conceptCards.map((card, index) => {
          const isExpanded = expandedCard === index;
          const emoji = CONCEPT_EMOJIS[index % CONCEPT_EMOJIS.length];

          return (
            <Card
              key={index}
              className={`transition-all duration-200 ${
                isExpanded ? 'ring-2 ring-purple-400' : ''
              }`}
            >
              {/* Card header */}
              <button
                onClick={() => setExpandedCard(isExpanded ? null : index)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{emoji}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{card.concept}</h3>
                    <p className="text-sm text-gray-500">
                      {isExpanded ? 'Click to collapse' : 'Click to expand'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isExpanded && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-600">
                      {index + 1} of {conceptCards.length}
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-0">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-gray-700 leading-relaxed">{card.explanation}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </Card>
          );
        })
      ) : (
        // Fallback when no foundation cards available
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <BookOpen className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {video.title || `Understanding ${concept}`}
              </h3>
              <p className="text-gray-600">
                {video.explanation || video.aiExplanation ||
                  'Continue to the interactive exercises below to learn the key concepts step by step.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Video backup option */}
      {showVideoOption && video.backupVideo && (
        <Card className="overflow-hidden">
          <div className="p-4 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Video className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Video Available</p>
                <p className="text-xs text-gray-500 truncate max-w-[140px] sm:max-w-[200px]">
                  {video.backupVideo.title}
                </p>
              </div>
            </div>
            {onSwitchToVideo && (
              <button
                onClick={onSwitchToVideo}
                className="px-3 py-1.5 text-sm bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-colors font-medium"
              >
                Watch instead
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// Mode toggle component
function ModeToggle({
  currentMode,
  onModeChange,
  showVideoOption,
  showAiOption,
}: {
  currentMode: ContentMode;
  onModeChange: (mode: ContentMode) => void;
  showVideoOption: boolean;
  showAiOption: boolean;
}) {
  // Don't show toggle if only one option available
  if (!showVideoOption && !showAiOption) return null;
  if (currentMode === 'video' && !showAiOption) return null;
  if (currentMode === 'ai' && !showVideoOption) return null;

  return (
    <div className="flex items-center justify-center mb-6">
      <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl shadow-sm">
        <button
          onClick={() => onModeChange('video')}
          disabled={!showVideoOption && currentMode !== 'video'}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            currentMode === 'video'
              ? 'bg-white text-gray-900 shadow-md'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          } ${!showVideoOption && currentMode !== 'video' ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Video className="w-5 h-5" />
          Watch video
        </button>
        <button
          onClick={() => onModeChange('ai')}
          disabled={!showAiOption && currentMode !== 'ai'}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            currentMode === 'ai'
              ? 'bg-white text-gray-900 shadow-md'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          } ${!showAiOption && currentMode !== 'ai' ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <BookOpen className="w-5 h-5" />
          Read AI summary
        </button>
      </div>
    </div>
  );
}

// Transcript Summary component for PRO users
function TranscriptSummary({
  videoId,
  concept,
  isPro,
}: {
  videoId: string;
  concept?: string;
  isPro: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchSummary = async () => {
    if (hasFetched || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await sessionService.getTranscriptSummary({
        videoId,
        concept,
      });
      setSummary(result.summary);
      setKeyPoints(result.keyPoints || []);
      setHasFetched(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load summary');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isExpanded && !hasFetched) {
      fetchSummary();
    }
    setIsExpanded(!isExpanded);
  };

  if (!isPro) {
    return (
      <div className="px-6 py-4 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-200 rounded-lg">
              <FileText className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Video Transcript Summary</p>
              <p className="text-xs text-gray-400">AI-powered summary of key points</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 rounded-lg">
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">PRO</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100">
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <FileText className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Video Transcript Summary</p>
            <p className="text-xs text-gray-500">AI-powered summary of key points</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
            PRO
          </span>
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="px-6 pb-6">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Generating summary...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={() => {
                    setHasFetched(false);
                    fetchSummary();
                  }}
                  className="mt-2 text-sm text-red-700 underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}

            {summary && !isLoading && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
                  </div>
                </div>

                {/* Key Points */}
                {keyPoints.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Key Takeaways
                    </h4>
                    <ul className="space-y-2">
                      {keyPoints.map((point, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm text-gray-600"
                        >
                          <span className="w-5 h-5 flex items-center justify-center bg-purple-100 text-purple-700 rounded-full text-xs font-medium shrink-0">
                            {index + 1}
                          </span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function VideoStep({ day, session }: VideoStepProps) {
  const [hasWatched, setHasWatched] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0); // 0=main, 1=alt1, 2=alt2, 3+=AI generated
  const [isSearchingNew, setIsSearchingNew] = useState(false);
  const [aiGeneratedVideos, setAiGeneratedVideos] = useState<VideoMatch[]>([]);
  const [_searchError, _setSearchError] = useState<string | null>(null);
  const { hasTierAccess } = useAuthStore();
  useSessionStore(); // Store subscription for state changes
  const canAskAI = hasTierAccess(QuotaTier.PRO);

  const video = day.video;

  // Determine what options are available
  // Only show video tab if we have an actual playable video
  // adaptiveModality.defaultMode='ai' means AI is primary, but video tab still shows if backupVideo exists
  const hasActualVideo = !!(video?.videoId || video?.backupVideo?.videoId);
  const videoUnavailable = video?.videoAvailable === false || (!video?.videoId && !video?.backupVideo?.videoId);
  const showVideoOption = hasActualVideo && !videoUnavailable;

  // Check for AI explanation from multiple sources (for backwards compatibility)
  const hasAiContent = !!(video?.aiExplanation || video?.explanation ||
    (day.foundationCards && day.foundationCards.length > 0));
  const showAiOption = hasAiContent;

  // Adaptive modality state - default to AI summary
  const _adaptiveModality = video?.adaptiveModality;
  const defaultMode: ContentMode = 'ai';
  const [currentMode, setCurrentMode] = useState<ContentMode>(defaultMode);

  // Support both single alternative and array of alternatives
  const alternatives: VideoAlternative[] = video?.alternatives || (video?.alternative ? [video.alternative] : []);

  // Determine current video based on index
  // 0 = main video, 1-N = alternatives, N+ = AI generated
  const getCurrentVideo = (): VideoMatch | VideoAlternative | null => {
    if (activeVideoIndex === 0) return video || null;
    if (activeVideoIndex <= alternatives.length) return alternatives[activeVideoIndex - 1];
    const aiIndex = activeVideoIndex - 1 - alternatives.length;
    return aiGeneratedVideos[aiIndex] || null;
  };

  const currentVideo = getCurrentVideo() || video || null;
  const isOnMainVideo = activeVideoIndex === 0;
  const remainingPreScreened = Math.max(0, alternatives.length - activeVideoIndex); // How many pre-screened left after current

  // Get all used video IDs for exclusion
  const getUsedVideoIds = (): string[] => {
    const ids: string[] = [];
    if (video?.videoId) ids.push(video.videoId);
    alternatives.forEach(alt => { if (alt.videoId) ids.push(alt.videoId); });
    aiGeneratedVideos.forEach(v => { if (v.videoId) ids.push(v.videoId); });
    return ids;
  };

  // Handle "Try a different one" click - progressive fallback
  const handleTryDifferent = async () => {
    const nextIndex = activeVideoIndex + 1;

    // If we have more pre-screened alternatives, use them
    if (nextIndex <= alternatives.length) {
      setActiveVideoIndex(nextIndex);
      return;
    }

    // No more pre-screened alternatives - search for new video via AI
    setIsSearchingNew(true);
    try {
      const excludeIds = getUsedVideoIds();

      // Extract concept from day title (remove "Day N: " prefix if present)
      const rawTitle = video?.topicFocus || day.title || '';
      const concept = rawTitle.replace(/^Day\s+\d+:\s*/i, '').trim() || 'tutorial';

      const result = await sessionService.refreshVideo({
        sessionId: session.id,
        dayNumber: day.day,
        concept,
        skillLevel: session.skillLevel,
        excludeVideoIds: excludeIds,
      });

      // Convert response to VideoMatch format
      const fetchedVideo: VideoMatch = {
        title: result.video.title,
        videoId: result.video.videoId,
        channelName: result.video.channelName,
        url: result.video.url,
        startTime: result.video.startTime,
        endTime: result.video.endTime,
        watchInstructions: result.video.watchInstructions,
        estimatedMinutes: result.video.estimatedMinutes,
        matchPercent: result.video.matchPercent,
        keyTopics: result.video.keyTopics,
        whyThisVideo: result.video.whyThisVideo,
        alternatives: result.video.alternatives,
        contentType: result.video.contentType,
      };

      setAiGeneratedVideos(prev => [...prev, fetchedVideo]);
      // Index: 0=main, 1..N=alternatives, N+1..=AI videos
      // New AI video index = 1 + alternatives.length + current AI count
      setActiveVideoIndex(1 + alternatives.length + aiGeneratedVideos.length);
    } catch (error: any) {
      console.error('Failed to find new video:', error);
      // Show user-friendly error
      const errorMessage = error?.response?.data?.message || error?.message || 'Could not find a suitable video';
      alert(`Video search failed: ${errorMessage}\n\nPlease try the main recommended video.`);
    } finally {
      setIsSearchingNew(false);
    }
  };

  // Switch back to main video
  const handleUseMain = () => {
    setActiveVideoIndex(0);
  };

  // Get button text based on remaining options
  const _getTryDifferentText = (): string => {
    if (isSearchingNew) return 'Searching...';
    if (remainingPreScreened > 0) return 'Try another video';
    return 'Search for another';
  };

  // Dynamic title/subtitle based on mode
  const stepTitle = currentMode === 'ai' ? 'Learn & Understand 📚' : 'Watch & Learn 📺';
  const stepSubtitle = currentMode === 'ai'
    ? 'AI-curated explanation for focused learning'
    : `${currentVideo?.estimatedMinutes || video?.estimatedMinutes || 6} minute focused video`;
  const stepIcon = currentMode === 'ai' ? BookOpen : Play;
  const stepGradient = currentMode === 'ai' ? 'from-purple-400 to-indigo-500' : 'from-red-400 to-red-500';

  // Handle mode switching
  const handleModeChange = (mode: ContentMode) => {
    setCurrentMode(mode);
  };

  // Switch to video from AI explanation
  const handleSwitchToVideo = () => {
    setCurrentMode('video');
  };

  return (
    <StepLayout
      icon={stepIcon}
      iconGradient={stepGradient}
      title={stepTitle}
      subtitle={stepSubtitle}
    >
      {/* Mode toggle - only show if both options available */}
      {(showVideoOption || showAiOption) && (showVideoOption !== showAiOption || (showVideoOption && showAiOption)) && (
        <ModeToggle
          currentMode={currentMode}
          onModeChange={handleModeChange}
          showVideoOption={!!showVideoOption}
          showAiOption={!!showAiOption}
        />
      )}

      {/* AI Explanation Mode - "Learn & Understand" */}
      {currentMode === 'ai' && (
        video ? (
          <AIExplanation
            video={video}
            onSwitchToVideo={showVideoOption ? handleSwitchToVideo : undefined}
            showVideoOption={!!showVideoOption}
            foundationCards={day.foundationCards}
          />
        ) : (
          // No video object - render Learn & Understand from foundation cards directly
          <LearnUnderstandContent
            day={day}
            onSwitchToVideo={showVideoOption ? handleSwitchToVideo : undefined}
            showVideoOption={!!showVideoOption}
          />
        )
      )}

      {/* Video Mode */}
      {currentMode === 'video' && (
        <>
          {/* Main Video Card */}
          <Card className="overflow-hidden">
            <VideoCard
              video={currentVideo}
              fallbackTitle={day.title}
            />

            {/* Why this video */}
            {isOnMainVideo && video?.whyThisVideo && video.whyThisVideo.length > 0 && (
              <div className="px-6 pb-6">
                <div className="flex flex-wrap gap-2">
                  {video.whyThisVideo.map((reason, idx) => (
                    <span key={idx} className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                      ✓ {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Switch back link when not viewing main */}
            {!isOnMainVideo && (
              <div className="px-6 pb-4">
                <button
                  onClick={handleUseMain}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  ← Back to recommended video
                </button>
              </div>
            )}

            {/* Key topics */}
            {video?.keyTopics && video.keyTopics.length > 0 && (
              <div className="px-6 pb-6 space-y-2">
                <h3 className="text-sm font-medium text-gray-700">Key topics to focus on:</h3>
                <ul className="space-y-1">
                  {video.keyTopics.map((topic, index) => {
                    const topicText = typeof topic === 'string' ? topic : (topic as any)?.note || (topic as any)?.title || '';
                    if (!topicText) return null;
                    return (
                      <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                        {topicText}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Actions footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={handleTryDifferent}
                disabled={isSearchingNew}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700
                           transition-colors disabled:opacity-50"
              >
                {isSearchingNew ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {currentVideo?.videoId ? 'Try different video' : 'Try alternative video'}
              </button>

              {showAiOption && (
                <button
                  onClick={() => handleModeChange('ai')}
                  className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  Read AI summary instead
                </button>
              )}
            </div>

            {/* Transcript Summary - PRO feature */}
            {currentVideo?.videoId && (
              <TranscriptSummary
                videoId={currentVideo.videoId}
                concept={video?.concept || video?.topicFocus || day.title}
                isPro={canAskAI}
              />
            )}
          </Card>
        </>
      )}

      {/* Mark as completed */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col items-center gap-4"
      >
        <button
          onClick={() => setHasWatched(!hasWatched)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            hasWatched
              ? 'bg-focus-100 text-focus-700 border-2 border-focus-500'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <CheckCircle2 className={`w-5 h-5 ${hasWatched ? 'text-focus-500' : ''}`} />
          {hasWatched
            ? (currentMode === 'ai' ? 'Read!' : 'Watched!')
            : (currentMode === 'ai' ? 'Mark as read' : 'Mark as watched')
          }
        </button>

        {/* Ask AI (PRO feature) - only show in video mode */}
        {currentMode === 'video' && (
          canAskAI ? (
            <Button variant="secondary" size="sm" leftIcon={<MessageCircle className="w-4 h-4" />}>
              <span className="hidden sm:inline">Ask AI about this video</span>
              <span className="sm:hidden">Ask AI</span>
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400 whitespace-nowrap">
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Ask AI (PRO)</span>
              <span className="sm:hidden">PRO</span>
            </div>
          )
        )}
      </motion.div>
    </StepLayout>
  );
}
