import { addCalendarDays, localDateAt, startOfLocalDateAtHour, weekdayOf } from '@wakewake/domain';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { FloatingCreateButton } from '@/components/FloatingCreateButton';
import { Screen } from '@/components/Screen';
import { TodoRow } from '@/features/todos/TodoRow';
import {
  compareVisibleTodoItems,
  partitionVisibleTodoItemsByCompletion,
  selectVisibleTodoItems,
} from '@/features/todos/visibleTodoItems';
import { useOccurrenceStates, useTodoRange } from '@/query/todoQueries';
import { useSettings } from '@/query/settingsQueries';
import { useAppTheme } from '@/theme/useAppTheme';
import { calendarWeekday, getCalendarDayPresentation } from './calendarDayPresentation';

export function CalendarScreen() {
  const theme = useAppTheme();
  const settings = useSettings();
  const timezone = settings.data?.timezone ?? 'UTC';
  const today = localDateAt(new Date(), timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const weekStart = useMemo(
    () => addCalendarDays(selectedDate, -((weekdayOf(selectedDate) + 6) % 7)),
    [selectedDate],
  );
  const weekEnd = addCalendarDays(weekStart, 7);
  const window = useMemo(
    () => ({
      start: startOfLocalDateAtHour(weekStart, 0, timezone),
      end: startOfLocalDateAtHour(weekEnd, 0, timezone),
      startDate: weekStart,
      endDateExclusive: weekEnd,
    }),
    [timezone, weekEnd, weekStart],
  );
  const todos = useTodoRange(window, timezone);
  const states = useOccurrenceStates(todos.data?.map((todo) => todo.id));
  const items = useMemo(
    () => selectVisibleTodoItems(todos.data ?? [], states.data ?? [], window),
    [states.data, todos.data, window],
  );
  const selectedItems = items
    .filter((item) => {
      if (item.timing.kind === 'allDay') {
        return item.timing.startDate <= selectedDate && item.timing.endDateExclusive > selectedDate;
      }
      const instant = item.timing.startAt ?? item.timing.dueAt;
      return instant !== null && localDateAt(instant, timezone) === selectedDate;
    })
    .sort(compareVisibleTodoItems);
  const selectedSections = partitionVisibleTodoItemsByCompletion(selectedItems);
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const [, month, day] = selectedDate.split('-');

  return (
    <View style={styles.flex}>
      <Screen
        eyebrow={`${selectedDate.slice(0, 4)} · ${String(Number(month)).padStart(2, '0')}`}
        title={`${Number(month)} 月 ${Number(day)} 日，星期${calendarWeekday(selectedDate)}`}
        subtitle={`${selectedItems.length} 项安排`}
        action={
          <Pressable accessibilityRole="button" onPress={() => setSelectedDate(today)}>
            <Text style={{ color: theme.color.accent, fontWeight: '700' }}>今天</Text>
          </Pressable>
        }
      >
        <View style={styles.weekActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedDate(addCalendarDays(selectedDate, -7))}
          >
            <Text style={{ color: theme.color.accent }}>上一周</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedDate(addCalendarDays(selectedDate, 7))}
          >
            <Text style={{ color: theme.color.accent }}>下一周</Text>
          </Pressable>
        </View>
        <View
          style={[
            styles.weekStrip,
            { backgroundColor: theme.color.surface, borderColor: theme.color.border },
          ]}
        >
          {days.map((date) => {
            const presentation = getCalendarDayPresentation(date, today, selectedDate);
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={presentation.accessibilityLabel}
                accessibilityState={{ selected: presentation.isSelected }}
                onPress={() => setSelectedDate(date)}
                style={[
                  styles.day,
                  {
                    backgroundColor: presentation.isToday ? theme.color.accentSoft : 'transparent',
                    borderColor: 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.weekday,
                    presentation.isToday && styles.todayWeekday,
                    presentation.isSelected && styles.selectedWeekday,
                    {
                      color:
                        presentation.isToday || presentation.isSelected
                          ? theme.color.accentInk
                          : theme.color.textMuted,
                    },
                  ]}
                >
                  {presentation.visibleWeekday}
                </Text>
                <View
                  style={[
                    styles.dateCircle,
                    presentation.isSelected && { backgroundColor: theme.color.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.date,
                      presentation.isToday && styles.todayDate,
                      {
                        color: presentation.isSelected
                          ? theme.isDark
                            ? theme.color.background
                            : theme.color.surface
                          : presentation.isToday
                            ? theme.color.accentInk
                            : theme.color.text,
                      },
                    ]}
                  >
                    {Number(date.slice(-2))}
                  </Text>
                </View>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: items.some((item) => itemMatchesDate(item, date, timezone))
                        ? theme.color.mint
                        : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.sectionTitle, { color: theme.color.text }]}>当天安排</Text>
        {selectedItems.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="当天没有事项"
            description="点击右下角添加一项安排。"
          />
        ) : (
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: theme.color.surface, borderColor: theme.color.border },
            ]}
          >
            {selectedSections.unfinished.map((item) => (
              <Animated.View key={item.key} layout={todoLayoutTransition}>
                <TodoRow item={item} timezone={timezone} />
              </Animated.View>
            ))}
            {selectedSections.completed.length > 0 ? (
              <Animated.View
                key="completed-section"
                layout={todoLayoutTransition}
                style={[
                  styles.completedHeader,
                  {
                    backgroundColor: theme.color.mintSoft,
                    borderColor: theme.color.border,
                  },
                ]}
              >
                <Text style={[styles.completedTitle, { color: theme.color.mintInk }]}>
                  已完成事项
                </Text>
                <Text style={[styles.completedCount, { color: theme.color.textSecondary }]}>
                  {selectedSections.completed.length} 项
                </Text>
              </Animated.View>
            ) : null}
            {selectedSections.completed.map((item) => (
              <Animated.View key={item.key} layout={todoLayoutTransition}>
                <TodoRow item={item} timezone={timezone} />
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </Screen>
      <FloatingCreateButton initialDate={selectedDate} />
    </View>
  );
}

const todoLayoutTransition = LinearTransition.duration(220).reduceMotion(ReduceMotion.System);

function itemMatchesDate(
  item: ReturnType<typeof selectVisibleTodoItems>[number],
  date: string,
  timezone: string,
): boolean {
  if (item.timing.kind === 'allDay')
    return item.timing.startDate <= date && item.timing.endDateExclusive > date;
  const instant = item.timing.startAt ?? item.timing.dueAt;
  return instant !== null && localDateAt(instant, timezone) === date;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  weekActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  weekStrip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 5,
  },
  weekday: { fontSize: 11, fontWeight: '600' },
  todayWeekday: { fontWeight: '900' },
  selectedWeekday: { fontWeight: '800' },
  dateCircle: {
    width: 34,
    height: 34,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { fontSize: 15, fontWeight: '700' },
  todayDate: { fontWeight: '900' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginTop: 28, marginBottom: 14 },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  completedHeader: {
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  completedTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  completedCount: { fontSize: 12, fontWeight: '600' },
});
