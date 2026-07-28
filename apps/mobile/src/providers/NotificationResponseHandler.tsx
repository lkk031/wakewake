import type { NotificationResponse } from 'expo-notifications';
import { router } from 'expo-router';
import { type PropsWithChildren, useEffect } from 'react';

import {
  getExpoNotificationsModule,
  isNotificationRuntimeSupported,
} from '@/services/notifications/notificationRuntime';

export function NotificationResponseHandler({ children }: PropsWithChildren) {
  useEffect(() => {
    if (!isNotificationRuntimeSupported()) return;

    const Notifications = getExpoNotificationsModule();
    const handleResponse = (response: NotificationResponse) => {
      const todoId = response.notification.request.content.data?.todoId;
      if (typeof todoId !== 'string') return;
      router.push({ pathname: '/todo/[id]', params: { id: todoId } });
    };
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse !== null) {
      handleResponse(lastResponse);
      Notifications.clearLastNotificationResponse();
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, []);

  return children;
}
