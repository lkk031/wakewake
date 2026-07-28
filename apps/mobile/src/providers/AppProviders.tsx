import { QueryClientProvider } from '@tanstack/react-query';
import { SQLiteProvider } from 'expo-sqlite';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { configureDatabase, DATABASE_NAME } from '@/db/database';
import { queryClient } from '@/query/queryClient';
import { useAppTheme } from '@/theme/useAppTheme';
import { AppLifecycle } from './AppLifecycle';
import { AppServicesProvider } from './AppServicesProvider';
import { NotificationResponseHandler } from './NotificationResponseHandler';
import { UndoProvider } from './UndoProvider';

export function AppProviders({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const handleError = useCallback((nextError: Error) => setError(nextError), []);

  if (error !== null) {
    return (
      <InitializationError
        error={error}
        onRetry={() => {
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <SQLiteProvider
      key={attempt}
      databaseName={DATABASE_NAME}
      onInit={configureDatabase}
      onError={handleError}
    >
      <AppServicesProvider>
        <QueryClientProvider client={queryClient}>
          <AppLifecycle>
            <NotificationResponseHandler>
              <UndoProvider>{children}</UndoProvider>
            </NotificationResponseHandler>
          </AppLifecycle>
        </QueryClientProvider>
      </AppServicesProvider>
    </SQLiteProvider>
  );
}

interface InitializationErrorProps {
  error: Error;
  onRetry: () => void;
}

function InitializationError({ error, onRetry }: InitializationErrorProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.errorPage, { backgroundColor: theme.color.background }]}>
      <Text style={[styles.errorTitle, { color: theme.color.text }]}>无法打开本地数据</Text>
      <Text style={[styles.errorMessage, { color: theme.color.textSecondary }]}>
        {error.message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={[styles.retryButton, { backgroundColor: theme.color.accent }]}
      >
        <Text style={styles.retryText}>重试</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  errorPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  errorMessage: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  retryButton: { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
