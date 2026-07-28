import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useLayoutEffect } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import 'react-native-reanimated';

import { AppProviders } from '@/providers/AppProviders';
import { useSettings } from '@/query/settingsQueries';
import { appearanceColorSchemeForThemeMode } from '@/theme/themeMode';

export { ErrorBoundary } from 'expo-router';
export const unstable_settings = { initialRouteName: '(tabs)' };
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Metro resolves bundled font assets through a static require.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const [loaded, error] = useFonts({ SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf') });
  useEffect(() => {
    if (error) throw error;
  }, [error]);
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;
  return (
    <AppProviders>
      <ThemedRoutes />
    </AppProviders>
  );
}

function ThemedRoutes() {
  const settings = useSettings();
  const themeMode = settings.data?.themeMode ?? 'system';
  const colorScheme = useColorScheme();

  useLayoutEffect(() => {
    Appearance.setColorScheme(appearanceColorSchemeForThemeMode(themeMode));
  }, [themeMode]);

  useEffect(
    () => () => {
      Appearance.setColorScheme('unspecified');
    },
    [],
  );

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="quick-create"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="todo/[id]" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </ThemeProvider>
  );
}
