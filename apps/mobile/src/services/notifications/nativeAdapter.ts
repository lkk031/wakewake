import type * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getExpoNotificationsModule, isNotificationRuntimeSupported } from './notificationRuntime';
import type { DesiredNotification } from './planner';

export const REMINDER_CHANNEL_ID = 'reminders-v1';

export interface NativeScheduledNotification {
  identifier: string;
  logicalKey: string | null;
}

export interface NotificationPermissionState {
  status: 'granted' | 'denied' | 'undetermined' | 'unsupported';
  granted: boolean;
  canAskAgain: boolean;
}

export interface NotificationNativeAdapter {
  supported: boolean;
  ensureChannel(): Promise<void>;
  getPermissionState(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  listScheduled(): Promise<NativeScheduledNotification[]>;
  schedule(notification: DesiredNotification): Promise<string>;
  scheduleTest(scheduledAt: Date): Promise<string>;
  cancel(identifier: string): Promise<void>;
}

export class ExpoNotificationAdapter implements NotificationNativeAdapter {
  public readonly supported = isNotificationRuntimeSupported();

  public async ensureChannel(): Promise<void> {
    if (!this.supported || Platform.OS !== 'android') return;
    const Notifications = getExpoNotificationsModule();
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: '事项提醒',
      description: 'WakeWake 的本地待办提醒',
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: [0, 250, 150, 250],
      showBadge: true,
    });
  }

  public async getPermissionState(): Promise<NotificationPermissionState> {
    if (!this.supported) return unsupportedPermissionState();
    return mapPermissionState(await getExpoNotificationsModule().getPermissionsAsync());
  }

  public async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.supported) return unsupportedPermissionState();
    await this.ensureChannel();
    return mapPermissionState(await getExpoNotificationsModule().requestPermissionsAsync());
  }

  public async listScheduled(): Promise<NativeScheduledNotification[]> {
    if (!this.supported) return [];
    const requests = await getExpoNotificationsModule().getAllScheduledNotificationsAsync();
    return requests
      .map((request) => ({
        identifier: request.identifier,
        logicalKey:
          typeof request.content.data?.wakewakeLogicalKey === 'string'
            ? request.content.data.wakewakeLogicalKey
            : null,
      }))
      .filter((request) => request.logicalKey !== null);
  }

  public async schedule(notification: DesiredNotification): Promise<string> {
    if (!this.supported) throw new Error('Notifications are unavailable in this runtime');
    const Notifications = getExpoNotificationsModule();
    return Notifications.scheduleNotificationAsync({
      content: {
        title: 'WakeWake 提醒',
        body: '你有一项待办即将到时间。',
        data: {
          wakewakeManaged: true,
          wakewakeLogicalKey: notification.logicalKey,
          todoId: notification.todoId,
          occurrenceKey: notification.occurrenceKey,
        },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notification.scheduledAt,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
  }

  public async scheduleTest(scheduledAt: Date): Promise<string> {
    if (!this.supported) throw new Error('Notifications are unavailable in this runtime');
    const Notifications = getExpoNotificationsModule();
    return Notifications.scheduleNotificationAsync({
      content: {
        title: 'WakeWake 测试提醒',
        body: '本地通知已经可以正常送达。',
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledAt,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
  }

  public async cancel(identifier: string): Promise<void> {
    if (!this.supported) return;
    await getExpoNotificationsModule().cancelScheduledNotificationAsync(identifier);
  }
}

function mapPermissionState(
  permission: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  const { IosAuthorizationStatus } = getExpoNotificationsModule();
  const provisional = permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  return {
    status: permission.granted || provisional ? 'granted' : permission.status,
    granted: permission.granted || provisional,
    canAskAgain: permission.canAskAgain,
  };
}

function unsupportedPermissionState(): NotificationPermissionState {
  return { status: 'unsupported', granted: false, canAskAgain: false };
}

if (isNotificationRuntimeSupported()) {
  getExpoNotificationsModule().setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
