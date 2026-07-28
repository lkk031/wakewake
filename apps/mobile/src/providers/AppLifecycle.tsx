import { focusManager } from '@tanstack/react-query';
import { type PropsWithChildren, useEffect } from 'react';
import { AppState } from 'react-native';

import { queryClient } from '@/query/queryClient';
import { settingsKeys, todoKeys } from '@/query/queryKeys';
import { getDeviceTimezone } from '@/services/localization/deviceTimezone';
import { useAppServices } from './AppServicesProvider';

export function AppLifecycle({ children }: PropsWithChildren) {
  const { notificationCoordinator, settingsRepository } = useAppServices();
  useEffect(() => {
    const refreshActiveState = async () => {
      try {
        const changed = await settingsRepository.synchronizeSystemTimezone(getDeviceTimezone());
        if (changed) {
          await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
        }
      } catch {
        // A localization failure must not block data refresh or notification repair.
      }
      await queryClient.invalidateQueries({ queryKey: todoKeys.all });
      await notificationCoordinator.reconcile().catch(() => undefined);
    };
    focusManager.setFocused(AppState.currentState === 'active');
    if (AppState.currentState === 'active') void refreshActiveState();
    const subscription = AppState.addEventListener('change', (status) => {
      const active = status === 'active';
      focusManager.setFocused(active);
      if (active) void refreshActiveState();
    });
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, [notificationCoordinator, settingsRepository]);

  return children;
}
