import { addCalendarDays, isOverdue, localDateAt, startOfLocalDateAtHour } from '@wakewake/domain';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { FloatingCreateButton } from '@/components/FloatingCreateButton';
import { Screen } from '@/components/Screen';
import { TodoRow } from '@/features/todos/TodoRow';
import {
  compareVisibleTodoItems,
  selectVisibleTodoItems,
  visibleTodoDate,
  type VisibleTodoItem,
} from '@/features/todos/visibleTodoItems';
import { useAgendaTodos, useOccurrenceStates } from '@/query/todoQueries';
import { useSettings } from '@/query/settingsQueries';
import { useAppTheme } from '@/theme/useAppTheme';

export function AgendaScreen() {
  const theme = useAppTheme();
  const settings = useSettings();
  const timezone = settings.data?.timezone ?? 'UTC';
  const now = new Date();
  const today = localDateAt(now, timezone);
  const window = useMemo(() => {
    const startDate = addCalendarDays(today, -7);
    const endDateExclusive = addCalendarDays(today, 91);
    return {
      start: startOfLocalDateAtHour(startDate, 0, timezone),
      end: startOfLocalDateAtHour(endDateExclusive, 0, timezone),
      startDate,
      endDateExclusive,
    };
  }, [timezone, today]);
  const todos = useAgendaTodos(window, timezone, now);
  const states = useOccurrenceStates(todos.data?.map((todo) => todo.id));
  const visibleItems = useMemo(
    () => selectVisibleTodoItems(todos.data ?? [], states.data ?? [], window),
    [states.data, todos.data, window],
  );
  const groups = useMemo(() => {
    const overdue: VisibleTodoItem[] = [];
    const byDate = new Map<string, VisibleTodoItem[]>();

    for (const item of visibleItems) {
      const date = visibleTodoDate(item, timezone);
      if (date < today) {
        if (item.status === 'open') overdue.push(item);
        continue;
      }
      const group = byDate.get(date) ?? [];
      group.push(item);
      byDate.set(date, group);
    }

    for (const todo of todos.data ?? []) {
      if (
        todo.timing.kind !== 'unscheduled' &&
        todo.recurrence === null &&
        isOverdue(todo, now) &&
        !overdue.some((item) => item.todo.id === todo.id)
      ) {
        overdue.push({
          key: todo.id,
          todo,
          occurrenceKey: null,
          timing: todo.timing,
          status: todo.status,
        });
      }
    }

    overdue.sort(compareVisibleTodoItems);
    const datedGroups = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => [date, items.sort(compareVisibleTodoItems)] as const);
    return overdue.length === 0
      ? datedGroups
      : ([['overdue', overdue] as const, ...datedGroups] satisfies readonly (readonly [
          string,
          VisibleTodoItem[],
        ])[]);
  }, [now, timezone, today, todos.data, visibleItems]);

  return (
    <View style={styles.flex}>
      <Screen eyebrow="UP NEXT" title="接下来" subtitle="逾期事项，以及未来 90 天的安排。">
        {groups.length === 0 ? (
          <EmptyState
            icon="calendar-clear-outline"
            title="暂时没有安排"
            description="新建有日期的事项后，会按日期显示在这里。"
          />
        ) : (
          groups.map(([date, group]) => (
            <View key={date} style={styles.group}>
              <Text
                style={[
                  styles.groupLabel,
                  { color: date === 'overdue' ? theme.color.critical : theme.color.text },
                ]}
              >
                {date === 'overdue' ? '逾期' : formatDateLabel(date, today)}
              </Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.color.surface, borderColor: theme.color.border },
                ]}
              >
                {group.map((item) => (
                  <TodoRow key={item.key} item={item} timezone={timezone} />
                ))}
              </View>
            </View>
          ))
        )}
      </Screen>
      <FloatingCreateButton />
    </View>
  );
}

function formatDateLabel(date: string, today: string): string {
  if (date === today) return '今天';
  if (date === addCalendarDays(today, 1)) return '明天';
  const [, month, day] = date.split('-');
  return `${Number(month)} 月 ${Number(day)} 日`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { marginBottom: 24 },
  groupLabel: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
});
