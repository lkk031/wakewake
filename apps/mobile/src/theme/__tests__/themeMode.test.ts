import { describe, expect, it } from 'vitest';

import { appearanceColorSchemeForThemeMode } from '../themeMode';

describe('theme mode appearance mapping', () => {
  it('maps persisted modes to React Native appearance values', () => {
    expect(appearanceColorSchemeForThemeMode('system')).toBe('unspecified');
    expect(appearanceColorSchemeForThemeMode('light')).toBe('light');
    expect(appearanceColorSchemeForThemeMode('dark')).toBe('dark');
  });
});
