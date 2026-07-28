import { isRunningInExpoGo } from 'expo';
import type * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';

type ExpoNotificationsModule = typeof ExpoNotifications;

let notificationsModule: ExpoNotificationsModule | null = null;

export function isNotificationRuntimeSupported(): boolean {
  return Platform.OS !== 'web' && !isRunningInExpoGo();
}

export function getExpoNotificationsModule(): ExpoNotificationsModule {
  if (!isNotificationRuntimeSupported()) {
    throw new Error('Notifications are unavailable in this runtime');
  }

  // Metro must see a literal module name, but unsupported runtimes must not evaluate it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notificationsModule ??= require('expo-notifications') as ExpoNotificationsModule;
  return notificationsModule;
}
