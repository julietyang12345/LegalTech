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
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <div className={clsx(
          'inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-gradient-to-br',
          iconGradient
        )}>
          <Icon className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {title}
        </h1>
        <p className="text-gray-600">
          {subtitle}
        </p>
      </div>

      {children}
    </div>
  );
}
