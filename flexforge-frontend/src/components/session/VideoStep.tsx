import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Clock, CheckCircle2, MessageCircle, Lock, Star, ChevronDown, Youtube } from 'lucide-react';
import { Card, Button } from '@/components/common';
import { useAuthStore } from '@/stores/authStore';
import { QuotaTier } from '@/types';
import type { CurriculumDay, Session, VideoMatch, VideoAlternative } from '@/types';

interface VideoStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

// Video card component - reused for main and alternative
function VideoCard({
  video,
  fallbackTitle,
  isAlternative = false,
  onSelect,
}: {
  video: VideoMatch | VideoAlternative | null;
  fallbackTitle: string;
  isAlternative?: boolean;
  onSelect?: () => void;
}) {
  const embedUrl = video?.url?.replace('watch?v=', 'embed/') ||
                   (video?.videoId ? `https://www.youtube.com/embed/${video.videoId}` : '');

  return (
    <div className={isAlternative ? 'border border-gray-200 rounded-xl overflow-hidden' : ''}>
      {/* Video embed */}
      <div className={`aspect-video bg-gray-900 relative ${isAlternative ? 'max-h-48' : ''}`}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white">
            <Play className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium mb-2">{video?.title || fallbackTitle}</p>
            <p className="text-xs text-gray-400">
              {video?.searchQuery
                ? `Search: "${video.searchQuery}"`
                : 'Video not available'}
            </p>
          </div>
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
          {isAlternative && onSelect && (
            <button
              onClick={onSelect}
              className="shrink-0 px-3 py-1.5 text-sm bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-colors"
            >
              Use This
            </button>
          )}
        </div>

        {/* Timestamps */}
        {video?.startTime && video?.endTime && (
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
            <Clock className="w-3 h-3" />
            <span>Watch {video.startTime} → {video.endTime}</span>
          </div>
        )}

        {/* Watch instructions (main video only) */}
        {!isAlternative && video?.watchInstructions && (
          <div className="p-3 bg-blue-50 rounded-lg mt-4">
            <p className="text-sm text-blue-800">{video.watchInstructions}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoStep({ day, session }: VideoStepProps) {
  const [hasWatched, setHasWatched] = useState(false);
  const [showAlternative, setShowAlternative] = useState(false);
  const [activeVideo, setActiveVideo] = useState<'main' | 'alt'>('main');
  const { hasTierAccess } = useAuthStore();
  const canAskAI = hasTierAccess(QuotaTier.PRO);

  const video = day.video;
  const alternative = video?.alternative;
  const currentVideo = activeVideo === 'main' ? video : alternative;

  // Switch to alternative
  const handleUseAlternative = () => {
    setActiveVideo('alt');
    setShowAlternative(false);
  };

  // Switch back to main
  const handleUseMain = () => {
    setActiveVideo('main');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                       bg-gradient-to-br from-red-400 to-red-500 mb-4">
          <Play className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Watch & Learn 📺
        </h1>
        <p className="text-gray-600">
          {currentVideo?.estimatedMinutes || video?.estimatedMinutes || 6} minute focused video
        </p>
      </div>

      {/* Main Video Card */}
      <Card className="overflow-hidden">
        {/* Recommendation badge */}
        {video?.matchPercent && (
          <div className="px-6 py-3 bg-gradient-to-r from-brand-50 to-brand-100 border-b border-brand-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-brand-500 fill-current" />
              <span className="text-sm font-medium text-brand-700">
                {activeVideo === 'main' ? 'Recommended' : alternative?.differentiator || 'Alternative'}
              </span>
            </div>
            <span className="text-xs text-brand-600 bg-brand-200 px-2 py-0.5 rounded-full">
              {activeVideo === 'main' ? video.matchPercent : alternative?.matchPercent}% match
            </span>
          </div>
        )}

        <VideoCard
          video={currentVideo || null}
          fallbackTitle={day.title}
        />

        {/* Why this video - only for main */}
        {activeVideo === 'main' && video?.whyThisVideo && video.whyThisVideo.length > 0 && (
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

        {/* Switch back link when viewing alternative */}
        {activeVideo === 'alt' && (
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
              {video.keyTopics.map((topic, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  {topic}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Alternative Option - only when main is active */}
      {activeVideo === 'main' && alternative && (
        <div className="space-y-3">
          {!showAlternative ? (
            <button
              onClick={() => setShowAlternative(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <span>Also great: {alternative.differentiator}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-600">
                    {alternative.differentiator}
                  </h4>
                  <button
                    onClick={() => setShowAlternative(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Hide
                  </button>
                </div>
                <VideoCard
                  video={alternative}
                  fallbackTitle={day.title}
                  isAlternative
                  onSelect={handleUseAlternative}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Mark as watched */}
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
          {hasWatched ? 'Watched!' : 'Mark as watched'}
        </button>

        {/* Ask AI (PRO feature) */}
        {canAskAI ? (
          <Button variant="secondary" size="sm" leftIcon={<MessageCircle className="w-4 h-4" />}>
            Ask AI about this video
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Lock className="w-4 h-4" />
            <span>Ask AI (PRO feature)</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
