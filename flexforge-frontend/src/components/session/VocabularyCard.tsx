import { useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useBrowserTTS } from '@/hooks/useBrowserTTS';
import type { VocabularyItem, TargetLanguage, LanguageFeatures } from '@/types';

interface VocabularyCardProps {
  vocabulary: VocabularyItem;
  language: TargetLanguage;
  features?: LanguageFeatures;
  showRomanization?: boolean;
  onMastered?: () => void;
  isReview?: boolean;
}

/**
 * VocabularyCard - Core learning unit for language learning
 *
 * Displays:
 * - Term (in target language script)
 * - Romanization (pinyin, romaji, etc.) - toggleable
 * - Definition
 * - Tap-to-hear pronunciation (browser TTS)
 * - Example sentences (expandable)
 *
 * Designed for the daily habit loop - minimal friction, instant audio.
 */
export function VocabularyCard({
  vocabulary,
  language,
  features,
  showRomanization: initialShowRomanization = true,
  onMastered,
  isReview = false,
}: VocabularyCardProps) {
  const [showRomanization, setShowRomanization] = useState(initialShowRomanization);
  const [showExamples, setShowExamples] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  const { speak, isSpeaking, isSupported } = useBrowserTTS(language, {
    rate: 0.9, // Slightly slower for learning
    onEnd: () => setHasPlayed(true),
  });

  // Play pronunciation
  const handlePlayAudio = () => {
    if (vocabulary.audioUrl) {
      // Use pre-recorded audio if available
      const audio = new Audio(vocabulary.audioUrl);
      audio.play();
      setHasPlayed(true);
    } else {
      // Fall back to browser TTS
      speak(vocabulary.term);
    }
  };

  // Get tone indicator for tonal languages
  const getToneIndicator = () => {
    if (!features?.hasTones || !vocabulary.tone) return null;

    const tones = Array.isArray(vocabulary.tone) ? vocabulary.tone : [vocabulary.tone];
    const toneColors: Record<number, string> = {
      1: 'bg-red-100 text-red-700',      // High flat
      2: 'bg-yellow-100 text-yellow-700', // Rising
      3: 'bg-green-100 text-green-700',   // Dipping
      4: 'bg-blue-100 text-blue-700',     // Falling
      0: 'bg-gray-100 text-gray-600',     // Neutral
      5: 'bg-gray-100 text-gray-600',     // Neutral (alternative)
    };

    return (
      <div className="flex gap-1">
        {tones.map((tone, idx) => (
          <span
            key={idx}
            className={`px-1.5 py-0.5 text-xs font-medium rounded ${toneColors[tone] || 'bg-gray-100'}`}
          >
            T{tone}
          </span>
        ))}
      </div>
    );
  };

  // Get gender indicator for gendered languages
  const getGenderIndicator = () => {
    if (!features?.hasGender || !vocabulary.gender) return null;

    const genderConfig: Record<string, { label: string; color: string }> = {
      masculine: { label: 'm', color: 'bg-blue-100 text-blue-700' },
      feminine: { label: 'f', color: 'bg-pink-100 text-pink-700' },
      neuter: { label: 'n', color: 'bg-gray-100 text-gray-600' },
    };

    const config = genderConfig[vocabulary.gender];
    if (!config) return null;

    return (
      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border-2 overflow-hidden bg-white shadow-sm ${
        isReview ? 'border-amber-200' : 'border-gray-200'
      }`}
    >
      {/* Review badge */}
      {isReview && (
        <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200">
          <span className="text-xs font-medium text-amber-700">Review</span>
        </div>
      )}

      {/* Main content */}
      <div className="p-5">
        {/* Top row: Term + Audio button */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Term in target language */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`font-bold text-gray-900 ${
                  features?.hasScript ? 'text-3xl' : 'text-2xl'
                }`}
                lang={language}
                dir={features?.isRTL ? 'rtl' : 'ltr'}
              >
                {vocabulary.scriptVariants?.primary || vocabulary.term}
              </h3>
              {getToneIndicator()}
              {getGenderIndicator()}
            </div>

            {/* Secondary script variant (e.g., traditional Chinese, kanji) */}
            {vocabulary.scriptVariants?.secondary && (
              <p className="text-lg text-gray-500 mt-1">
                {vocabulary.scriptVariants.secondary}
              </p>
            )}

            {/* Romanization (toggleable) */}
            {vocabulary.romanization && (
              <div className="flex items-center gap-2 mt-2">
                {showRomanization ? (
                  <p className="text-lg text-purple-600 font-medium">
                    {vocabulary.romanization}
                  </p>
                ) : (
                  <p className="text-lg text-gray-400 italic">
                    (tap to show)
                  </p>
                )}
                <button
                  onClick={() => setShowRomanization(!showRomanization)}
                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                  title={showRomanization ? 'Hide romanization' : 'Show romanization'}
                >
                  {showRomanization ? (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Audio button */}
          <button
            onClick={handlePlayAudio}
            disabled={!isSupported && !vocabulary.audioUrl}
            className={`p-4 rounded-full transition-all ${
              isSpeaking
                ? 'bg-purple-100 text-purple-600 scale-110'
                : hasPlayed
                ? 'bg-green-50 text-green-600 hover:bg-green-100'
                : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
            } ${!isSupported && !vocabulary.audioUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Play pronunciation"
          >
            {isSpeaking ? (
              <Volume2 className="w-6 h-6 animate-pulse" />
            ) : !isSupported && !vocabulary.audioUrl ? (
              <VolumeX className="w-6 h-6" />
            ) : (
              <Volume2 className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Definition */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-gray-700 text-lg">{vocabulary.definition}</p>
          {vocabulary.partOfSpeech && (
            <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 rounded">
              {vocabulary.partOfSpeech}
            </span>
          )}
        </div>

        {/* Proficiency level badge */}
        {vocabulary.proficiencyLevel && (
          <div className="mt-3">
            <span className="inline-block px-2 py-0.5 text-xs font-medium text-purple-600 bg-purple-50 rounded">
              {vocabulary.proficiencyLevel}
            </span>
          </div>
        )}

        {/* Examples (expandable) */}
        {vocabulary.examples && vocabulary.examples.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showExamples ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {showExamples ? 'Hide examples' : `Show ${vocabulary.examples.length} example${vocabulary.examples.length > 1 ? 's' : ''}`}
            </button>

            {showExamples && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-3 space-y-3"
              >
                {vocabulary.examples.map((example, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p
                          className="text-gray-900 font-medium"
                          lang={language}
                          dir={features?.isRTL ? 'rtl' : 'ltr'}
                        >
                          {example.sentence}
                        </p>
                        {example.romanization && showRomanization && (
                          <p className="text-sm text-purple-600 mt-1">
                            {example.romanization}
                          </p>
                        )}
                        <p className="text-sm text-gray-600 mt-1">
                          {example.translation}
                        </p>
                      </div>
                      {/* Example audio button */}
                      <button
                        onClick={() => {
                          if (example.audioUrl) {
                            new Audio(example.audioUrl).play();
                          } else {
                            speak(example.sentence);
                          }
                        }}
                        className="p-2 rounded-full bg-white hover:bg-gray-100 transition-colors"
                        title="Play example"
                      >
                        <Volume2 className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Bottom action (optional) */}
      {onMastered && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onMastered}
            className="w-full py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors"
          >
            Got it!
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default VocabularyCard;
