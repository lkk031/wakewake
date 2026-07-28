import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useAppTheme } from '@/theme/useAppTheme';

interface FloatingCreateButtonProps {
  initialDate?: string;
}

export function FloatingCreateButton({ initialDate }: FloatingCreateButtonProps) {
  const theme = useAppTheme();

  function openQuickCreate() {
    if (initialDate) {
      router.push({ pathname: '/quick-create', params: { date: initialDate } });
      return;
    }
    router.push('/quick-create');
  }

  return (
    <Pressable
      accessibilityLabel="新建事项"
      accessibilityRole="button"
      onPress={openQuickCreate}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.color.accent,
          ...(Platform.OS === 'web'
            ? { boxShadow: `0 8px 16px ${theme.color.shadow}33` }
            : { shadowColor: theme.color.shadow }),
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Ionicons
        name="add"
        size={30}
        color={theme.isDark ? theme.color.background : theme.color.surface}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 20,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {},
      default: {
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
    }),
  },
});
