import { focusManager } from '@tanstack/react-query';
import { type PropsWithChildren, useEffect } from 'react';
import { AppState } from 'react-native';

import { reconcileNotificationsSafely } from '@/query/notificationQueries';
import { queryClient } from '@/query/queryClient';
import { notificationKeys, settingsKeys, todoKeys } from '@/query/queryKeys';
import { getDeviceTimezone } from '@/services/localization/deviceTimezone';
import { useAppServices } from './AppServicesProvider';

interface AppStateObserverActions {
  setFocused: (focused: boolean) => void;
  refreshActiveState: (forceRearm: boolean) => void | Promise<void>;
}

export function createAppStateObserver({
  setFocused,
  refreshActiveState,
}: AppStateObserverActions): (status: string | null) => void {
  let hasObservedActive = false;

  return (status) => {
    const active = status === 'active';
    setFocused(active);
    if (!active) return;

    const forceRearm = !hasObservedActive;
    hasObservedActive = true;
    void refreshActiveState(forceRearm);
  };
}

export function AppLifecycle({ children }: PropsWithChildren) {
  const { notificationCoordinator, settingsRepository } = useAppServices();
  useEffect(() => {
    const refreshActiveState = async (forceRearm: boolean) => {
      try {
        const changed = await settingsRepository.synchronizeSystemTimezone(getDeviceTimezone());
        if (changed) {
          await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
        }
      } catch {
        // A localization failure must not block data refresh or notification repair.
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: todoKeys.all }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.permission }),
      ]);
      await reconcileNotificationsSafely(
        notificationCoordinator,
        queryClient,
        forceRearm ? { forceRearm: true } : undefined,
      );
    };
    const observeAppState = createAppStateObserver({
      setFocused: (focused) => focusManager.setFocused(focused),
      refreshActiveState,
    });
    observeAppState(AppState.currentState);
    const subscription = AppState.addEventListener('change', observeAppState);
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, [notificationCoordinator, settingsRepository]);

  return children;
}
