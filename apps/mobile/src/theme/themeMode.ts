import type { ThemeMode } from '@wakewake/domain';

export type AppearanceColorScheme = 'light' | 'dark' | 'unspecified';

export function appearanceColorSchemeForThemeMode(mode: ThemeMode): AppearanceColorScheme {
  return mode === 'system' ? 'unspecified' : mode;
}
