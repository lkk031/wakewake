import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppServices } from '@/providers/AppServicesProvider';

const permissionKey = ['notifications', 'permission'] as const;

export function useNotificationPermission() {
  const { notificationCoordinator } = useAppServices();
  return useQuery({
    queryKey: permissionKey,
    queryFn: () => notificationCoordinator.getPermissionState(),
  });
}

export function useRequestNotificationPermission() {
  const { notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationCoordinator.requestPermission(),
    onSuccess: async (permission) => {
      queryClient.setQueryData(permissionKey, permission);
      await queryClient.invalidateQueries({ queryKey: permissionKey });
    },
  });
}

export function useTestNotification() {
  const { notificationCoordinator } = useAppServices();
  return useMutation({
    mutationFn: () => notificationCoordinator.scheduleTestNotification(),
  });
}
