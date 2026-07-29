import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useNotificationPermission,
  useRequestNotificationPermission,
} from '@/query/notificationQueries';
import type { NotificationPermissionState } from '@/services/notifications/nativeAdapter';
import { useCreateTodo } from '@/query/todoQueries';
import { useDefaultReminders, useSettings, useTodoTemplates } from '@/query/settingsQueries';
import { useAppTheme } from '@/theme/useAppTheme';
import { TodoForm } from './TodoForm';
import { createTodoFormDefaults, mapTodoForm, type TodoFormValues } from './todoForm';

interface QuickCreateScreenProps {
  initialDate?: string | undefined;
}

export const QUICK_CREATE_PERMISSION_READ_ERROR_TITLE = '事项已保存';
export const QUICK_CREATE_PERMISSION_READ_ERROR_MESSAGE =
  '暂时无法读取通知权限。你可以先在系统设置中开启通知，然后到“设置”使用“提醒同步”。';

interface CompleteQuickCreateOptions {
  hasReminders: boolean;
  permission: NotificationPermissionState | undefined;
  refetchPermission: () => Promise<NotificationPermissionState>;
  requestPermission: () => Promise<unknown>;
  promptForPermission: (actions: { dismiss: () => void; enable: () => Promise<void> }) => void;
  showPermissionReadError: () => void;
  close: () => void;
}

export async function completeQuickCreate({
  hasReminders,
  permission,
  refetchPermission,
  requestPermission,
  promptForPermission,
  showPermissionReadError,
  close,
}: CompleteQuickCreateOptions): Promise<void> {
  if (!hasReminders) {
    close();
    return;
  }

  let resolvedPermission = permission;
  try {
    resolvedPermission ??= await refetchPermission();
  } catch {
    showPermissionReadError();
    close();
    return;
  }

  if (resolvedPermission.status === 'undetermined' && resolvedPermission.canAskAgain) {
    promptForPermission({
      dismiss: close,
      enable: async () => {
        try {
          await requestPermission();
        } finally {
          close();
        }
      },
    });
    return;
  }

  close();
}

export function QuickCreateScreen({ initialDate }: QuickCreateScreenProps) {
  const theme = useAppTheme();
  const settings = useSettings();
  const defaultReminders = useDefaultReminders();
  const templates = useTodoTemplates();
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
    await completeQuickCreate({
      hasReminders: todo.reminders.length > 0,
      permission: permission.data,
      refetchPermission: async () => {
        const result = await permission.refetch();
        if (result.error) throw result.error;
        if (result.data === undefined) throw new Error('Notification permission is unavailable');
        return result.data;
      },
      requestPermission: () => requestPermission.mutateAsync(),
      promptForPermission: ({ dismiss, enable }) =>
        Alert.alert('开启事项提醒？', 'WakeWake 需要通知权限，才能在事项到期前提醒你。', [
          { text: '稍后', style: 'cancel', onPress: dismiss },
          { text: '开启', onPress: () => void enable() },
        ]),
      showPermissionReadError: () =>
        Alert.alert(
          QUICK_CREATE_PERMISSION_READ_ERROR_TITLE,
          QUICK_CREATE_PERMISSION_READ_ERROR_MESSAGE,
        ),
      close: () => router.back(),
    });
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      edges={['top', 'bottom']}
    >
      <TodoForm
        initialValues={initialValues}
        timezone={settings.data.timezone}
        templates={templates.data ?? []}
        saving={createTodo.isPending}
        onCancel={() => router.back()}
        onSubmit={save}
      />
    </SafeAreaView>
  );
}
