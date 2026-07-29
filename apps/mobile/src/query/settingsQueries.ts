import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupSettings, ReminderRule, TodoTemplate } from '@wakewake/domain';

import { useAppServices } from '@/providers/AppServicesProvider';
import { reconcileNotificationsSafely } from './notificationQueries';
import { settingsKeys, todoKeys } from './queryKeys';

export function useSettings() {
  const { settingsRepository } = useAppServices();
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => settingsRepository.getSettings(),
  });
}

export function useUpdateSettings() {
  const { notificationCoordinator, settingsRepository } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: BackupSettings) => settingsRepository.updateSettings(settings),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
        queryClient.invalidateQueries({ queryKey: todoKeys.all }),
      ]);
      await reconcileNotificationsSafely(notificationCoordinator, queryClient);
    },
  });
}

export function useDefaultReminders() {
  const { settingsRepository } = useAppServices();
  return useQuery({
    queryKey: settingsKeys.defaultReminders,
    queryFn: () => settingsRepository.getDefaultReminders(),
  });
}

export function useTodoTemplates() {
  const { todoTemplateRepository } = useAppServices();
  return useQuery({
    queryKey: settingsKeys.todoTemplates,
    queryFn: () => todoTemplateRepository.list(),
  });
}

export function useCreateTodoTemplate() {
  const { todoTemplateRepository } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (template: TodoTemplate) => todoTemplateRepository.create(template),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.todoTemplates }),
  });
}

export function useUpdateTodoTemplate() {
  const { todoTemplateRepository } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (template: TodoTemplate) => todoTemplateRepository.update(template),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.todoTemplates }),
  });
}

export function useDeleteTodoTemplate() {
  const { todoTemplateRepository } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => todoTemplateRepository.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.todoTemplates }),
  });
}

export function useReorderTodoTemplates() {
  const { todoTemplateRepository } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: readonly string[]) => todoTemplateRepository.reorder(orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.todoTemplates }),
  });
}

export function useSetDefaultReminders() {
  const { settingsRepository } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reminders: ReminderRule[]) => settingsRepository.setDefaultReminders(reminders),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsKeys.defaultReminders });
    },
  });
}
