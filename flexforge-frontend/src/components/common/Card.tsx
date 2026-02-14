import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hover' | 'active';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Card({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  const variants = {
    default: 'bg-surface rounded-xl shadow-card dark:shadow-none dark:border dark:border-border',
    hover: 'bg-surface rounded-xl shadow-card dark:shadow-none dark:border dark:border-border transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5',
    active: 'bg-surface rounded-xl shadow-card dark:shadow-none dark:border dark:border-border border-l-4 border-l-brand-500',
  };

  const paddings = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-5 sm:p-8',
  };

  return (
    <div className={clsx(variants[variant], paddings[padding], className)} {...props}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-start justify-between mb-4', className)}>
      <div>
        <h3 className="text-lg font-semibold text-content">{title}</h3>
        {subtitle && <p className="text-sm text-content-tertiary mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardContent({ className, children, ...props }: CardContentProps) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
