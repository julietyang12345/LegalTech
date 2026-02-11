import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'invisible';
          appearance?: 'always' | 'execute' | 'interaction-only';
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  siteKey?: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
}

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(TURNSTILE_SCRIPT_ID)) {
      if (window.turnstile) {
        resolve();
      } else {
        // Script loaded but not initialized yet, wait for it
        const check = setInterval(() => {
          if (window.turnstile) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(check);
          reject(new Error('Turnstile script load timeout'));
        }, 10000);
      }
      return;
    }

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const check = setInterval(() => {
        if (window.turnstile) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error('Turnstile initialization timeout'));
      }, 10000);
    };
    script.onerror = () => reject(new Error('Failed to load Turnstile script'));
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({
  onToken,
  siteKey,
  appearance = 'interaction-only',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const initWidget = useCallback(async () => {
    const key = siteKey || import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!key || !containerRef.current) return;

    try {
      await loadTurnstileScript();

      // Clean up existing widget
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }

      if (window.turnstile && containerRef.current) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: key,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => onTokenRef.current(''),
          theme: 'light',
          appearance,
        });
      }
    } catch (err) {
      console.error('Failed to initialize Turnstile:', err);
    }
  }, [siteKey, appearance]);

  useEffect(() => {
    initWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [initWidget]);

  return <div ref={containerRef} />;
}
