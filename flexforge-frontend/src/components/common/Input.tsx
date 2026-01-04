import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full px-4 py-2.5 bg-white border rounded-lg',
            'text-gray-900 placeholder-gray-400',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/20',
            error
              ? 'border-red-500 focus:border-red-500'
              : 'border-gray-300 hover:border-gray-400 focus:border-brand-500',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  showCount?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, hint, maxLength, showCount, className, value, ...props }, ref) => {
    const charCount = typeof value === 'string' ? value.length : 0;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          value={value}
          maxLength={maxLength}
          className={clsx(
            'w-full px-4 py-3 bg-white border rounded-lg resize-none min-h-[100px]',
            'text-gray-900 placeholder-gray-400',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/20',
            error
              ? 'border-red-500 focus:border-red-500'
              : 'border-gray-300 hover:border-gray-400 focus:border-brand-500',
            className
          )}
          {...props}
        />
        <div className="flex justify-between mt-1.5">
          {error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : hint ? (
            <p className="text-sm text-gray-500">{hint}</p>
          ) : (
            <span />
          )}
          {showCount && maxLength && (
            <span className={clsx(
              'text-sm',
              charCount >= maxLength * 0.9 ? 'text-alert-500' : 'text-gray-400'
            )}>
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';
