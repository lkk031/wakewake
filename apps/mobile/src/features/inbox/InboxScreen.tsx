import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { FloatingCreateButton } from '@/components/FloatingCreateButton';
import { Screen } from '@/components/Screen';
import { useInboxTodos, useSetTodoCompletion } from '@/query/todoQueries';
import { useAppTheme } from '@/theme/useAppTheme';

export function InboxScreen() {
  const theme = useAppTheme();
  const inbox = useInboxTodos();
  const setCompletion = useSetTodoCompletion();
  const todos = inbox.data ?? [];
  return (
    <View style={styles.flex}>
      <Screen
        eyebrow={`INBOX · ${todos.length}`}
        title="收集箱"
        subtitle="先记下来，再决定它属于哪一天。"
      >
        {todos.length === 0 ? (
          <EmptyState
            icon="file-tray-outline"
            title="这里还没有待安排的事"
            description="不确定具体日期时，先放进收集箱。之后可以一键安排到日历。"
            actionLabel="记下第一件事"
            onAction={() => router.push('/quick-create')}
          />
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.color.surface, borderColor: theme.color.border },
            ]}
          >
            {todos.map((todo) => {
              const completed = todo.status === 'completed';
              return (
                <Pressable
                  key={todo.id}
                  onPress={() => router.push({ pathname: '/todo/[id]', params: { id: todo.id } })}
                  style={[styles.row, { borderBottomColor: theme.color.border }]}
                >
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={completed ? '恢复未完成' : '标记完成'}
                    accessibilityState={{ checked: completed }}
                    onPress={() =>
                      void setCompletion.mutateAsync({
                        todoId: todo.id,
                        completedAt: completed ? null : new Date(),
                      })
                    }
                    style={[
                      styles.checkbox,
                      {
                        borderColor: completed ? theme.color.accent : theme.color.textMuted,
                        backgroundColor: completed ? theme.color.accent : 'transparent',
                      },
                    ]}
                  >
                    {completed ? (
                      <Ionicons
                        name="checkmark"
                        size={15}
                        color={theme.isDark ? theme.color.background : theme.color.surface}
                      />
                    ) : null}
                  </Pressable>
                  <View style={styles.copy}>
                    <Text
                      style={[
                        styles.title,
                        { color: completed ? theme.color.textMuted : theme.color.text },
                        completed && styles.completed,
                      ]}
                    >
                      {todo.title}
                    </Text>
                    {todo.notes ? (
                      <Text
                        numberOfLines={1}
                        style={[styles.notes, { color: theme.color.textSecondary }]}
                      >
                        {todo.notes}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Screen>
      <FloatingCreateButton />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  row: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 23,
    height: 23,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  completed: { textDecorationLine: 'line-through' },
  notes: { fontSize: 12, marginTop: 4 },
});
