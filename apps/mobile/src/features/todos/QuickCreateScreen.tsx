import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert } from 'react-native';

import {
  useNotificationPermission,
  useRequestNotificationPermission,
} from '@/query/notificationQueries';
import { useCreateTodo } from '@/query/todoQueries';
import { useDefaultReminders, useSettings } from '@/query/settingsQueries';
import { TodoForm } from './TodoForm';
import { createTodoFormDefaults, mapTodoForm, type TodoFormValues } from './todoForm';

interface QuickCreateScreenProps {
  initialDate?: string | undefined;
}

export function QuickCreateScreen({ initialDate }: QuickCreateScreenProps) {
  const settings = useSettings();
  const defaultReminders = useDefaultReminders();
  const createTodo = useCreateTodo();
  const permission = useNotificationPermission();
  const requestPermission = useRequestNotificationPermission();
  const initialValues = useMemo(
    () =>
      settings.data && defaultReminders.data
        ? createTodoFormDefaults(
            settings.data.timezone,
            settings.data.defaultDurationMinutes,
            defaultReminders.data,
            Crypto.randomUUID,
            { dateAnchor: initialDate },
          )
        : null,
    [defaultReminders.data, initialDate, settings.data],
  );

  if (!settings.data || !initialValues) return null;

  async function save(values: TodoFormValues) {
    const todo = mapTodoForm(values, settings.data?.timezone ?? 'UTC', Crypto.randomUUID());
    await createTodo.mutateAsync(todo);
    if (
      todo.reminders.length > 0 &&
      permission.data?.status === 'undetermined' &&
      permission.data.canAskAgain
    ) {
      Alert.alert('开启事项提醒？', 'WakeWake 需要通知权限，才能在事项到期前提醒你。', [
        { text: '稍后', style: 'cancel', onPress: () => router.back() },
        {
          text: '开启',
          onPress: () => void requestPermission.mutateAsync().finally(() => router.back()),
        },
      ]);
      return;
    }
    router.back();
  }

  return (
    <TodoForm
      initialValues={initialValues}
      timezone={settings.data.timezone}
      saving={createTodo.isPending}
      onCancel={() => router.back()}
      onSubmit={save}
    />
  );
}
