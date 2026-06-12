import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type RevealTitleProps = {
  children: ReactNode;
  enabled?: boolean;
};

export function RevealTitle({ children, enabled = true }: RevealTitleProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isVisible, setIsVisible] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(true);
      return;
    }

    const title = titleRef.current;
    if (!title) {
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.18,
      },
    );

    observer.observe(title);

    return () => observer.disconnect();
  }, [enabled]);

  return (
    <h2
      ref={titleRef}
      className={enabled ? `reveal-title${isVisible ? ' is-visible' : ''}` : undefined}
    >
      {children}
    </h2>
  );
}
