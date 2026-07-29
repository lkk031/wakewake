export const lightTheme = {
  color: {
    background: '#F7F8FA',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    text: '#172033',
    textSecondary: '#5D667A',
    textMuted: '#8A93A5',
    border: '#E3E7EE',
    grid: '#E8EBF0',
    accent: '#4656D9',
    accentSoft: '#E8EAFF',
    accentInk: '#2F3BA7',
    mint: '#2A9D8F',
    mintSoft: '#DDF4EF',
    mintInk: '#17675F',
    amber: '#C17A18',
    amberSoft: '#FFF0D6',
    critical: '#C43D4F',
    criticalSoft: '#FDE8EB',
    tabBar: '#FCFCFD',
    shadow: '#1B2440',
  },
  isDark: false,
} as const;

export const darkTheme = {
  color: {
    background: '#0F1320',
    surface: '#171C2B',
    surfaceRaised: '#1E2435',
    text: '#F6F7FB',
    textSecondary: '#B9C0D0',
    textMuted: '#8992A7',
    border: '#2D3447',
    grid: '#272D3D',
    accent: '#9EA8FF',
    accentSoft: '#2B315A',
    accentInk: '#D9DDFF',
    mint: '#5DD5C4',
    mintSoft: '#173F3B',
    mintInk: '#B7FFF3',
    amber: '#F0B75F',
    amberSoft: '#493517',
    critical: '#FF8794',
    criticalSoft: '#4B232C',
    tabBar: '#151A28',
    shadow: '#000000',
  },
  isDark: true,
} as const;

export type AppTheme = typeof lightTheme | typeof darkTheme;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
