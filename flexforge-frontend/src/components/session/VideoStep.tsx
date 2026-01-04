import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, ExternalLink, Clock, CheckCircle2, MessageCircle, Lock } from 'lucide-react';
import { Card, Button } from '@/components/common';
import { useAuthStore } from '@/stores/authStore';
import { QuotaTier } from '@/types';
import type { CurriculumDay, Session } from '@/types';

interface VideoStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function VideoStep({ day, session }: VideoStepProps) {
  const [hasWatched, setHasWatched] = useState(false);
  const { hasTierAccess } = useAuthStore();
  const canAskAI = hasTierAccess(QuotaTier.PRO);

  const video = day.video;
  const videoUrl = video?.url || `https://www.youtube.com/results?search_query=${encodeURIComponent(session.skillName + ' ' + day.title)}`;

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
          {video?.estimatedMinutes || 6} minute focused video
        </p>
      </div>

      {/* Video card */}
      <Card className="overflow-hidden">
        {/* Video embed placeholder */}
        <div className="aspect-video bg-gray-900 relative">
          {video?.url ? (
            <iframe
              src={video.url.replace('watch?v=', 'embed/')}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-white">
              <Play className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">{video?.title || day.title}</p>
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open Video
              </a>
            </div>
          )}
        </div>

        {/* Video info */}
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {video?.title || day.title}
          </h2>

          {/* Timestamps */}
          {video?.startTime && video?.endTime && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <Clock className="w-4 h-4" />
              <span>Watch from {video.startTime} to {video.endTime}</span>
            </div>
          )}

          {/* Watch instructions */}
          {video?.watchInstructions && (
            <div className="p-4 bg-blue-50 rounded-lg mb-4">
              <p className="text-sm text-blue-800">{video.watchInstructions}</p>
            </div>
          )}

          {/* Key topics */}
          {video?.keyTopics && video.keyTopics.length > 0 && (
            <div className="space-y-2">
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
        </div>
      </Card>

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
