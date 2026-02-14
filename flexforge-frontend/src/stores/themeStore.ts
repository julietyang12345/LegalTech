import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

export const useThemeStore = create<ThemeState>()((set) => {
  // Rehydrate from localStorage on creation
  const stored = localStorage.getItem('flexforge-theme') as ThemeMode | null;
  const initial: ThemeMode = stored === 'dark' ? 'dark' : 'light';

  // Apply immediately
  applyTheme(initial);

  return {
    mode: initial,
    setMode: (mode: ThemeMode) => {
      localStorage.setItem('flexforge-theme', mode);
      applyTheme(mode);
      set({ mode });
    },
  };
});
