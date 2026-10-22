/**
 * Theme Context quản lý Dark/Light mode chuẩn AWS Visual Refresh cho web-admin.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyMode, Mode, setThemeClass, Theme } from '@cloudscape-design/global-styles';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  toggleMode: () => {},
  setMode: () => {},
});

const STORAGE_KEY = 'quick-grading-admin-theme-mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        return 'dark';
      }
    } catch {
      // Fallback nếu localStorage bị chặn
    }
    return 'light';
  });

  useEffect(() => {
    // Áp dụng Visual Refresh chuẩn AWS
    setThemeClass(Theme.VisualRefresh);
    applyMode(mode === 'dark' ? Mode.Dark : Mode.Light);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Bỏ qua lỗi lưu trữ
    }
  }, [mode]);

  const toggleMode = () => {
    setModeState((current) => (current === 'light' ? 'dark' : 'light'));
  };

  const setMode = (next: ThemeMode) => {
    setModeState(next);
  };

  return (
    <ThemeContext.Provider value={{ mode, toggleMode, setMode }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
