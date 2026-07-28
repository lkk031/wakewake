import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BackupV1 } from '@wakewake/domain';

import { useAppServices } from '@/providers/AppServicesProvider';
import { settingsKeys, todoKeys } from './queryKeys';

export function useExportBackup() {
  const { backupService } = useAppServices();
  return useMutation({ mutationFn: () => backupService.exportAndShare() });
}

export function usePickBackup() {
  const { backupService } = useAppServices();
  return useMutation({ mutationFn: () => backupService.pickBackup() });
}

export function useReplaceBackup() {
  const { backupService, notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backup: BackupV1) => backupService.replaceFromBackup(backup),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: todoKeys.all }),
        queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
      ]);
      await notificationCoordinator.reconcile();
    },
  });
}
