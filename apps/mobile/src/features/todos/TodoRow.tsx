import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getWallClockDateTime } from '@wakewake/domain';

import { CompletionCheckbox } from '@/components/CompletionCheckbox';
import { useSetTodoCompletion } from '@/query/todoQueries';
import { useAppTheme } from '@/theme/useAppTheme';
import type { VisibleTodoItem } from './visibleTodoItems';

interface TodoRowProps {
  item: VisibleTodoItem;
  timezone: string;
}

export function TodoRow({ item, timezone }: TodoRowProps) {
  const theme = useAppTheme();
  const setCompletion = useSetTodoCompletion();
  const completed = item.status === 'completed';
  const time =
    item.timing.kind === 'allDay'
      ? '全天'
      : formatTime(item.timing.startAt ?? item.timing.dueAt, timezone);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/todo/[id]', params: { id: item.todo.id } })}
      style={[styles.row, { borderBottomColor: theme.color.border }]}
    >
      <CompletionCheckbox
        completed={completed}
        onPress={() =>
          void setCompletion.mutateAsync({
            todoId: item.todo.id,
            completedAt: completed ? null : new Date(),
            ...(item.occurrenceKey === null ? {} : { occurrenceKey: item.occurrenceKey }),
          })
        }
      />
      <View style={styles.copy}>
        <Text
          style={[
            styles.title,
            { color: completed ? theme.color.textMuted : theme.color.text },
            completed && styles.completed,
          ]}
        >
          {item.todo.title}
        </Text>
        <Text style={[styles.meta, { color: theme.color.textSecondary }]}>
          {priorityLabel(item.todo.priority)}
          {item.todo.recurrence ? ' · 重复' : ''}
        </Text>
      </View>
      <Text style={[styles.time, { color: theme.color.textSecondary }]}>{time}</Text>
    </Pressable>
  );
}

function formatTime(date: Date | null, timezone: string): string {
  if (date === null) return '';
  const parts = getWallClockDateTime(date, timezone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function priorityLabel(priority: VisibleTodoItem['todo']['priority']): string {
  return { none: '普通', low: '低优先级', medium: '中优先级', high: '高优先级' }[priority];
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  completed: { textDecorationLine: 'line-through' },
  meta: { fontSize: 12, marginTop: 5 },
  time: { fontFamily: 'SpaceMono', fontSize: 12 },
});
