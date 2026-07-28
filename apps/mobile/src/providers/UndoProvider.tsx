import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

interface UndoAction {
  message: string;
  run: () => Promise<void>;
}

interface UndoContextValue {
  showUndo: (action: UndoAction) => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

export function UndoProvider({ children }: PropsWithChildren) {
  const theme = useAppTheme();
  const [action, setAction] = useState<UndoAction | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current);
    },
    [],
  );

  function showUndo(next: UndoAction) {
    if (timeout.current !== null) clearTimeout(timeout.current);
    setAction(next);
    timeout.current = setTimeout(() => setAction(null), 5_000);
  }

  return (
    <UndoContext value={{ showUndo }}>
      {children}
      {action !== null ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.snackbar, { backgroundColor: theme.color.text }]}
        >
          <Text style={[styles.message, { color: theme.color.background }]}>{action.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const pending = action;
              setAction(null);
              if (timeout.current !== null) clearTimeout(timeout.current);
              void pending.run();
            }}
          >
            <Text style={[styles.undo, { color: theme.color.accentSoft }]}>撤销</Text>
          </Pressable>
        </View>
      ) : null}
    </UndoContext>
  );
}

export function useUndo(): UndoContextValue {
  const value = useContext(UndoContext);
  if (value === null) throw new Error('useUndo must be used inside UndoProvider');
  return value;
}

const styles = StyleSheet.create({
  snackbar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: { flex: 1, fontSize: 14, fontWeight: '600' },
  undo: { fontSize: 14, fontWeight: '800', padding: 8 },
});
