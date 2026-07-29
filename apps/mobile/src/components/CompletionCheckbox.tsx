import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

interface CompletionCheckboxProps {
  completed: boolean;
  onPress: () => void;
}

export function CompletionCheckbox({ completed, onPress }: CompletionCheckboxProps) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={completed ? '恢复未完成' : '标记完成'}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed }}
      hitSlop={10}
      onPress={onPress}
      style={[
        styles.checkbox,
        {
          backgroundColor: completed ? theme.color.mintSoft : 'transparent',
          borderColor: completed ? theme.color.mint : theme.color.textMuted,
        },
      ]}
    >
      {completed ? <Ionicons name="checkmark" size={15} color={theme.color.mintInk} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
