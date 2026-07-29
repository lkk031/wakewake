import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useDeleteTodo,
  useRestoreDeletedTodo,
  useSetTodoCompletion,
  useTodo,
  useUpdateTodo,
} from '@/query/todoQueries';
import { useUndo } from '@/providers/UndoProvider';
import { useSettings } from '@/query/settingsQueries';
import { useAppTheme } from '@/theme/useAppTheme';
import { TodoForm } from './TodoForm';
import { mapTodoForm, todoToFormValues, type TodoFormValues } from './todoForm';

interface EditTodoScreenProps {
  id: string;
}

export function EditTodoScreen({ id }: EditTodoScreenProps) {
  const theme = useAppTheme();
  const todoQuery = useTodo(id);
  const settings = useSettings();
  const updateTodo = useUpdateTodo();
  const setCompletion = useSetTodoCompletion();
  const deleteTodo = useDeleteTodo();
  const restoreDeletedTodo = useRestoreDeletedTodo();
  const { showUndo } = useUndo();
  const initialValues = useMemo(
    () =>
      todoQuery.data && settings.data
        ? todoToFormValues(todoQuery.data, settings.data.timezone)
        : null,
    [settings.data, todoQuery.data],
  );

  if (todoQuery.isPending || settings.isPending) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.flex, { backgroundColor: theme.color.background }]}
      >
        <ActivityIndicator style={styles.loading} color={theme.color.accent} />
      </SafeAreaView>
    );
  }
  if (!todoQuery.data || !settings.data || !initialValues) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.messagePage, { backgroundColor: theme.color.background }]}
      >
        <Text style={{ color: theme.color.text }}>事项不存在或已删除。</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: theme.color.accent }}>返回</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const todo = todoQuery.data;
  async function save(values: TodoFormValues) {
    await updateTodo.mutateAsync(
      mapTodoForm(values, settings.data?.timezone ?? 'UTC', todo.id, todo),
    );
    router.back();
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.flex, { backgroundColor: theme.color.background }]}
    >
      <TodoForm
        initialValues={initialValues}
        timezone={settings.data.timezone}
        saving={updateTodo.isPending}
        recurrenceLocked={todo.recurrence !== null}
        onCancel={() => router.back()}
        onSubmit={save}
      />
      <View
        style={[
          styles.actions,
          { backgroundColor: theme.color.surface, borderColor: theme.color.border },
        ]}
      >
        {todo.recurrence === null ? (
          <Pressable
            disabled={setCompletion.isPending}
            onPress={() =>
              void setCompletion.mutateAsync({
                todoId: todo.id,
                completedAt: todo.status === 'completed' ? null : new Date(),
              })
            }
          >
            <Text style={[styles.action, { color: theme.color.accent }]}>
              {todo.status === 'completed' ? '恢复未完成' : '标记完成'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={deleteTodo.isPending}
          onPress={() =>
            Alert.alert('删除事项？', '事项会被移出所有视图。', [
              { text: '取消', style: 'cancel' },
              {
                text: '删除',
                style: 'destructive',
                onPress: () =>
                  void deleteTodo.mutateAsync(todo.id).then(() => {
                    router.back();
                    showUndo({
                      message: '事项已删除',
                      run: async () => {
                        await restoreDeletedTodo.mutateAsync(todo.id);
                      },
                    });
                  }),
              },
            ])
          }
        >
          <Text style={[styles.action, { color: theme.color.critical }]}>删除</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1 },
  messagePage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  actions: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
  },
  action: { fontSize: 15, fontWeight: '700', padding: 8 },
});
