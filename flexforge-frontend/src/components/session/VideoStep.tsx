import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Clock, CheckCircle2, MessageCircle, Lock, Star, Youtube, ExternalLink, RefreshCw, Loader2, BookOpen, Video, Sparkles, Info } from 'lucide-react';
import { Card, Button } from '@/components/common';
import { StepLayout } from './StepLayout';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { sessionService } from '@/services/sessionService';
import { QuotaTier, ContentMode } from '@/types';
import type { CurriculumDay, Session, VideoMatch, VideoAlternative } from '@/types';

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
  const youtubeUrl = video?.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : null;

  return (
    <div className={`rounded-xl overflow-hidden ${isAlternative ? 'border-2' : ''} ${isActive ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'}`}>
      {/* Video embed */}
      <div className={`aspect-video bg-gray-900 relative ${isAlternative ? 'max-h-48' : ''}`}>
        {embedUrl ? (
          <iframe
            title={video?.title || fallbackTitle}
            src={embedUrl}
            className="w-full h-full"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white">
            <Play className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium mb-2">{video?.title || fallbackTitle}</p>
            <p className="text-xs text-gray-400 mb-3">Video search failed - find one manually</p>
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                (video && 'searchQuery' in video && video.searchQuery)
                  ? video.searchQuery
                  : (video?.title || fallbackTitle) + ' tutorial'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <Youtube className="w-4 h-4" />
              Search on YouTube
            </a>
          </div>
        )}

        {/* Open on YouTube link - always show if we have a video */}
        {youtubeUrl && (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open on YouTube
          </a>
        )}
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

// AI Explanation component - shown when AI mode is selected
function AIExplanation({
  video,
  onSwitchToVideo,
  showVideoOption,
}: {
  video: VideoMatch;
  onSwitchToVideo?: () => void;
  showVideoOption: boolean;
}) {
  const explanation = video.explanation || video.aiExplanation || '';
  const concept = video.concept || video.title || 'this concept';
  const adaptiveInfo = video.adaptiveModality;

  // Simple markdown to HTML (handles basic formatting)
  const renderMarkdown = (text: string) => {
    return text
      .split('\n\n')
      .map((para, idx) => {
        // Handle headers
        if (para.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-lg font-semibold text-gray-900 mt-4 mb-2">
              {para.replace('## ', '')}
            </h3>
          );
        }
        if (para.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-base font-medium text-gray-800 mt-3 mb-1">
              {para.replace('### ', '')}
            </h4>
          );
        }

        // Handle bold text
        const withBold = para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Handle lists
        if (para.match(/^\d+\./m) || para.match(/^-/m)) {
          const items = para.split('\n').filter(Boolean);
          return (
            <ul key={idx} className="list-disc list-inside space-y-1 my-2">
              {items.map((item, i) => (
                <li
                  key={i}
                  className="text-gray-700"
                  dangerouslySetInnerHTML={{
                    __html: item.replace(/^[\d]+\.\s*|-\s*/, ''),
                  }}
                />
              ))}
            </ul>
          );
        }

        return (
          <p
            key={idx}
            className="text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: withBold }}
          />
        );
      });
  };

  return (
    <Card className="overflow-hidden">
      {/* Header badge */}
      <div className="px-6 py-3 bg-gradient-to-r from-purple-50 to-indigo-100 border-b border-purple-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-purple-700">AI Explanation</span>
        </div>
        {adaptiveInfo && (
          <span className="text-xs text-purple-600 bg-purple-200 px-2 py-0.5 rounded-full">
            {adaptiveInfo.reasonShort}
          </span>
        )}
      </div>

      {/* Explanation content */}
      <div className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          {video.title || `Understanding ${concept}`}
        </h3>

        {/* Why AI explanation */}
        {video.reason && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg mb-4">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800">{video.reason}</p>
          </div>
        )}

        {/* Main explanation */}
        <div className="prose prose-sm max-w-none space-y-3">
          {explanation ? (
            renderMarkdown(explanation)
          ) : (
            <p className="text-gray-600">
              This topic will be covered through the foundation cards and practice exercises below.
              Dive into the concepts step by step!
            </p>
          )}
        </div>
      </div>

      {/* Video backup option */}
      {showVideoOption && video.backupVideo && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Video className="w-4 h-4" />
              <span>Video available: {video.backupVideo.title}</span>
            </div>
            {onSwitchToVideo && (
              <button
                onClick={onSwitchToVideo}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium hover:underline"
              >
                Watch video instead →
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
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

export function VideoStep({ day, session }: VideoStepProps) {
  const [hasWatched, setHasWatched] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0); // 0=main, 1=alt1, 2=alt2, 3+=AI generated
  const [isSearchingNew, setIsSearchingNew] = useState(false);
  const [aiGeneratedVideos, setAiGeneratedVideos] = useState<VideoMatch[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { hasTierAccess } = useAuthStore();
  const { activeSession } = useSessionStore();
  const canAskAI = hasTierAccess(QuotaTier.PRO);

  const video = day.video;

  // Adaptive modality state
  const adaptiveModality = video?.adaptiveModality;
  const defaultMode = adaptiveModality?.defaultMode || (video?.useAiExplanation ? 'ai' : 'video');
  const [currentMode, setCurrentMode] = useState<ContentMode>(defaultMode);

  // Determine what options are available
  const showVideoOption = video?.videoAvailable !== false && (video?.showVideoOption || video?.videoId || video?.backupVideo);
  const showAiOption = video?.showAiOption !== false && (video?.aiExplanation || video?.explanation);

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
  const getTryDifferentText = (): string => {
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

      {/* AI Explanation Mode */}
      {currentMode === 'ai' && video && (
        <AIExplanation
          video={video}
          onSwitchToVideo={showVideoOption ? handleSwitchToVideo : undefined}
          showVideoOption={!!showVideoOption}
        />
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
                Try different video
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
              Ask AI about this video
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Lock className="w-4 h-4" />
              <span>Ask AI (PRO feature)</span>
            </div>
          )
        )}
      </motion.div>
    </StepLayout>
  );
}
