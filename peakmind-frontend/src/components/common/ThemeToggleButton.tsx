import { useEffect, useState } from 'react';
import { MoonStar, SunMedium } from 'lucide-react';

const THEME_KEY = 'peakmind-theme';

function applyTheme(nextTheme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('theme-light', nextTheme === 'light');
  root.classList.toggle('theme-dark', nextTheme === 'dark');
  localStorage.setItem(THEME_KEY, nextTheme);
}

export function ThemeToggleButton() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    const nextTheme = storedTheme ?? (prefersLight ? 'light' : 'dark');

    applyTheme(nextTheme);
    setIsLight(nextTheme === 'light');
  }, []);

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      onClick={() => {
        const nextTheme = isLight ? 'dark' : 'light';
        applyTheme(nextTheme);
        setIsLight(!isLight);
      }}
    >
      {isLight ? <MoonStar size={16} /> : <SunMedium size={16} />}
      {isLight ? 'Dark' : 'Light'}
    </button>
  );
}
