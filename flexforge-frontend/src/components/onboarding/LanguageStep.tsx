import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { ArrowRight, Check, ChevronDown, ChevronUp, Code2 } from 'lucide-react';
import type { LanguageConfig } from '@/types';

interface LanguageStepProps {
  selectedDirection: string;
  languageConfig: LanguageConfig;
  onSelect: (language: string) => void;
  isLoading?: boolean;
}

export function LanguageStep({
  selectedDirection,
  languageConfig,
  onSelect,
  isLoading,
}: LanguageStepProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    languageConfig.recommended
  );
  const [showAlternatives, setShowAlternatives] = useState(false);

  const hasAlternatives = languageConfig.alternatives && languageConfig.alternatives.length > 0;

  const handleContinue = () => {
    onSelect(selectedLanguage);
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold text-content mb-2">
          Choose your language
        </h2>
        <p className="text-content-secondary">
          For: <span className="font-medium text-brand-600">{selectedDirection}</span>
        </p>
      </div>

      {/* Recommended language */}
      <div className="mb-4">
        <button
          onClick={() => setSelectedLanguage(languageConfig.recommended)}
          className={clsx(
            'w-full text-left p-5 rounded-xl border-2 transition-all duration-200',
            'hover:shadow-md',
            selectedLanguage === languageConfig.recommended
              ? 'border-brand-500 bg-brand-50 shadow-md'
              : 'border-border bg-surface hover:border-brand-300'
          )}
        >
          <div className="flex items-start gap-4">
            <div
              className={clsx(
                'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
                selectedLanguage === languageConfig.recommended
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-tertiary text-content-secondary'
              )}
            >
              <Code2 className="w-6 h-6" />
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-content">
                    {languageConfig.recommended}
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                    Recommended
                  </span>
                </div>
                {selectedLanguage === languageConfig.recommended && (
                  <div className="w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-sm text-content-secondary">
                {languageConfig.recommendedReason}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Alternatives toggle */}
      {hasAlternatives && (
        <div className="mb-6">
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="flex items-center gap-2 text-sm text-content-tertiary hover:text-content-secondary transition-colors mx-auto"
          >
            {showAlternatives ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Hide alternatives
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Prefer another language?
              </>
            )}
          </button>

          {/* Alternative languages */}
          {showAlternatives && (
            <div className="mt-4 space-y-3">
              {languageConfig.alternatives!.map((alt) => (
                <button
                  key={alt.language}
                  onClick={() => setSelectedLanguage(alt.language)}
                  className={clsx(
                    'w-full text-left p-4 rounded-xl border-2 transition-all duration-200',
                    'hover:shadow-md',
                    selectedLanguage === alt.language
                      ? 'border-brand-500 bg-brand-50 shadow-md'
                      : 'border-border bg-surface hover:border-brand-300'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={clsx(
                        'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                        selectedLanguage === alt.language
                          ? 'bg-brand-500 text-white'
                          : 'bg-surface-tertiary text-content-secondary'
                      )}
                    >
                      <Code2 className="w-5 h-5" />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-content">{alt.language}</h3>
                        {selectedLanguage === alt.language && (
                          <div className="w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-content-secondary">{alt.reason}</p>
                      {alt.tradeoffs && (
                        <p className="text-xs text-amber-600 mt-1">
                          Note: {alt.tradeoffs}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      <Button
        size="lg"
        className="w-full"
        disabled={!selectedLanguage || isLoading}
        onClick={handleContinue}
        isLoading={isLoading}
        rightIcon={<ArrowRight className="w-5 h-5" />}
      >
        Continue with {selectedLanguage}
      </Button>

      {/* Reassurance */}
      <p className="text-center text-xs text-content-tertiary mt-4">
        All code examples and projects will use {selectedLanguage}
      </p>
    </div>
  );
}
