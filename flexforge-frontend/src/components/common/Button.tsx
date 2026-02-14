import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2 font-medium rounded-lg
      transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      active:scale-[0.98]
    `;

    const variants = {
      primary: `
        bg-brand-500 text-white shadow-md
        hover:bg-brand-600 hover:shadow-lg
        focus-visible:ring-brand-500
      `,
      secondary: `
        bg-surface text-content-secondary border border-border
        hover:bg-surface-tertiary hover:border-content-tertiary
        focus-visible:ring-gray-500
      `,
      accent: `
        bg-gradient-to-r from-alert-500 to-orange-500 text-white shadow-md
        hover:from-alert-600 hover:to-orange-600 hover:shadow-lg
        focus-visible:ring-alert-500
      `,
      ghost: `
        text-content-secondary hover:bg-surface-tertiary hover:text-content active:bg-surface-tertiary
      `,
      danger: `
        bg-red-500 text-white shadow-md
        hover:bg-red-600 hover:shadow-lg
        focus-visible:ring-red-500
      `,
    };

    const sizes = {
      sm: 'px-3 py-2 text-sm min-h-[40px]',      // Increased for mobile tap target
      md: 'px-4 py-2.5 text-sm min-h-[44px]',    // iOS minimum tap target
      lg: 'px-6 py-3 text-base min-h-[48px]',
      xl: 'px-8 py-4 text-lg min-h-[52px]',
    };

    return (
      <button
        ref={ref}
        className={clsx(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : leftIcon ? (
          leftIcon
        ) : null}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
