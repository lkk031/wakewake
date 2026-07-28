import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupSettings, ReminderRule } from '@wakewake/domain';

import { useAppServices } from '@/providers/AppServicesProvider';
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
      await notificationCoordinator.reconcile().catch(() => undefined);
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
