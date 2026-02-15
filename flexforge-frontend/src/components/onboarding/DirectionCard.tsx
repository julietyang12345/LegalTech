import { useState } from 'react';
import { clsx } from 'clsx';
import { Clock, Target, Wrench, DollarSign, Code2 } from 'lucide-react';
import type { LearningDirection } from '@/types';

interface DirectionCardProps {
  direction: LearningDirection;
  isSelected?: boolean;
  onClick: () => void;
  onLanguageChange?: (language: string) => void;
  selectedLanguage?: string;
}

export function DirectionCard({ direction, isSelected, onClick, onLanguageChange, selectedLanguage }: DirectionCardProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const displayLanguage = selectedLanguage || direction.languageConfig?.recommended;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left p-5 rounded-xl border-2 transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        isSelected
          ? 'border-brand-500 bg-brand-50 shadow-md'
          : 'border-border bg-surface hover:border-brand-300'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
            direction.isToolSpecific
              ? 'bg-amber-100 text-amber-600'
              : 'bg-brand-100 text-brand-600'
          )}
        >
          {direction.isToolSpecific ? (
            <Wrench className="w-5 h-5" />
          ) : (
            <Target className="w-5 h-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-content">{direction.title}</h3>
            <span
              className={clsx(
                'text-xs px-2 py-0.5 rounded-full',
                direction.isToolSpecific
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-brand-100 text-brand-700'
              )}
            >
              {direction.isToolSpecific ? 'Tool-specific' : 'Concept'}
            </span>
            {direction.isFree === false && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-tertiary text-content-secondary flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Paid tool
              </span>
            )}
          </div>

          {/* Payment note for paid tools */}
          {direction.paymentNote && (
            <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              {direction.paymentNote}
            </p>
          )}

          <p className="text-sm text-content-secondary mb-2">{direction.outcome}</p>

          {/* Language badge (for CODE/AI_AGENT directions) */}
          {direction.languageConfig && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700">
                  <Code2 className="w-3 h-3" />
                  {displayLanguage}
                </span>
                {isSelected && onLanguageChange && direction.languageConfig.alternatives && direction.languageConfig.alternatives.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAlternatives(!showAlternatives);
                    }}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    {showAlternatives ? 'Hide' : 'Change'}
                  </button>
                )}
              </div>
              {showAlternatives && isSelected && direction.languageConfig.alternatives && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[direction.languageConfig.recommended, ...direction.languageConfig.alternatives.map(a => a.language)].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLanguageChange?.(lang);
                        setShowAlternatives(false);
                      }}
                      className={clsx(
                        'text-xs px-2 py-1 rounded-md border transition-all',
                        displayLanguage === lang
                          ? 'bg-brand-50 border-brand-300 text-brand-700'
                          : 'bg-surface border-border text-content-secondary hover:border-brand-300'
                      )}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-content-tertiary">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              ~{direction.estimatedMinutes} min
            </span>
            <span className="flex items-center gap-1 flex-wrap">
              {direction.keywords.slice(0, 3).map((keyword) => (
                <span
                  key={keyword}
                  className="bg-surface-tertiary px-2 py-0.5 rounded text-content-secondary"
                >
                  {keyword}
                </span>
              ))}
            </span>
          </div>
        </div>

        {isSelected && (
          <div className="flex-shrink-0 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}
