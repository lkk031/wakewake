import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/useAppTheme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.container,
        { borderColor: theme.color.border, backgroundColor: theme.color.surface },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.color.accentSoft }]}>
        <Ionicons name={icon} size={28} color={theme.color.accent} />
      </View>
      <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.color.textSecondary }]}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.color.accent, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingVertical: 34,
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    transform: [{ rotate: '-4deg' }],
  },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 280 },
  action: {
    minHeight: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    marginTop: 22,
  },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
