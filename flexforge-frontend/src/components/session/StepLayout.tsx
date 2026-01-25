import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface StepLayoutProps {
  icon: LucideIcon;
  iconGradient: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}

export function StepLayout({
  icon: Icon,
  iconGradient,
  title,
  subtitle,
  children,
  className,
}: StepLayoutProps) {
  return (
    <div className={clsx('space-y-4 sm:space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <div className={clsx(
          'inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full mb-3 sm:mb-4 bg-gradient-to-br',
          iconGradient
        )}>
          <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
          {title}
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          {subtitle}
        </p>
      </div>

      {children}
    </div>
  );
}
