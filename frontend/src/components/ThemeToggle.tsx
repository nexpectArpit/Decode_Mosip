import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export type ThemeMode = 'light' | 'dark' | 'system';

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme') as ThemeMode;
    return saved || 'light';
  });

  const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement;
    const isDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for system theme changes if set to system
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#140A24] p-1 rounded-xl border border-slate-200 dark:border-[#951F6F]/40 shadow-xs">
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
          theme === 'light'
            ? 'bg-white text-[#F2680C] shadow-xs font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="Light Theme"
      >
        <Sun className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => setTheme('system')}
        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
          theme === 'system'
            ? 'bg-white dark:bg-[#25123E] text-[#F2680C] dark:text-[#951F6F] shadow-xs font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="System Preference"
      >
        <Monitor className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-[#25123E] text-[#a855f7] shadow-xs font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="Dark Theme"
      >
        <Moon className="w-4 h-4" />
      </button>
    </div>
  );
};
