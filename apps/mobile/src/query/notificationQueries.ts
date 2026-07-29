import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppServices } from '@/providers/AppServicesProvider';
import {
  reconcileNotificationsSafely,
  type NotificationSyncStatus,
} from './notificationReconciliation';
import { notificationKeys } from './queryKeys';

export { reconcileNotificationsSafely };
export type { NotificationSyncStatus };

export function useNotificationPermission() {
  const { notificationCoordinator } = useAppServices();
  return useQuery({
    queryKey: notificationKeys.permission,
    queryFn: () => notificationCoordinator.getPermissionState(),
  });
}

export function useNotificationSyncStatus() {
  return useQuery({
    queryKey: notificationKeys.syncStatus,
    queryFn: (): NotificationSyncStatus => ({ state: 'idle' }),
    staleTime: Infinity,
  });
}

export function useReconcileNotifications() {
  const { notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      reconcileNotificationsSafely(notificationCoordinator, queryClient, { forceRearm: true }),
  });
}

export function useRequestNotificationPermission() {
  const { notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationCoordinator.requestPermission(),
    onSuccess: async (permission) => {
      queryClient.setQueryData(notificationKeys.permission, permission);
      await queryClient.invalidateQueries({ queryKey: notificationKeys.permission });
      if (permission.granted) {
        await reconcileNotificationsSafely(notificationCoordinator, queryClient);
      }
    },
  });
}

export function useTestNotification() {
  const { notificationCoordinator } = useAppServices();
  return useMutation({
    mutationFn: () => notificationCoordinator.scheduleTestNotification(),
  });
}
