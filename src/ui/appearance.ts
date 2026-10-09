import { useEffect } from 'react';
import { FONT_OPTIONS, type Settings, type Theme } from '../storage/settings';

export function resolveTheme(theme: Theme, prefersDark: boolean): 'dark' | 'light' {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
}

export function useAppearance(settings: Pick<Settings, 'theme' | 'textFont' | 'numberFont'>) {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => { document.documentElement.dataset.theme = resolveTheme(settings.theme, query.matches); };
    applyTheme();
    query.addEventListener('change', applyTheme);
    return () => query.removeEventListener('change', applyTheme);
  }, [settings.theme]);
  useEffect(() => {
    const root = document.documentElement;
    const text = FONT_OPTIONS.find(font => font.value === settings.textFont) ?? FONT_OPTIONS[0];
    const numbers = FONT_OPTIONS.find(font => font.value === settings.numberFont) ?? FONT_OPTIONS[1];
    root.style.setProperty('--font-text', text.family);
    root.style.setProperty('--font-numbers', numbers.family);
    root.style.setProperty('--mono', 'var(--font-numbers)');
  }, [settings.textFont, settings.numberFont]);
}
