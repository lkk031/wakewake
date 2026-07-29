import type { QueryClient } from '@tanstack/react-query';

import type {
  NotificationCoordinator,
  ReconcileIssue,
  ReconcileResult,
} from '../services/notifications/NotificationCoordinator';
import { notificationKeys } from './queryKeys';

export type NotificationSyncStatus =
  | { state: 'idle' }
  | { state: 'running'; startedAt: Date; previousResult?: ReconcileResult }
  | { state: 'success'; startedAt: Date; completedAt: Date; result: ReconcileResult }
  | { state: 'error'; startedAt: Date; completedAt: Date; issues: ReconcileIssue[] };

const UNKNOWN_RECONCILE_ISSUE: ReconcileIssue = {
  stage: 'data-loading',
  message: 'Notification reconciliation failed unexpectedly',
};

export async function reconcileNotificationsSafely(
  notificationCoordinator: NotificationCoordinator,
  queryClient: QueryClient,
  options?: { forceRearm?: boolean } | undefined,
): Promise<ReconcileResult | null> {
  const startedAt = new Date();
  const previous = queryClient.getQueryData<NotificationSyncStatus>(notificationKeys.syncStatus);
  const runningStatus: NotificationSyncStatus =
    previous?.state === 'success'
      ? { state: 'running', startedAt, previousResult: previous.result }
      : { state: 'running', startedAt };
  queryClient.setQueryData(notificationKeys.syncStatus, runningStatus);

  try {
    const result = await notificationCoordinator.reconcile(new Date(), options);
    queryClient.setQueryData(notificationKeys.syncStatus, {
      state: 'success',
      startedAt,
      completedAt: new Date(),
      result,
    });
    if (__DEV__ && result.issues.length > 0) {
      console.warn(
        'Notification reconciliation completed with issues',
        summarizeIssues(result.issues),
      );
    }
    return result;
  } catch {
    queryClient.setQueryData(notificationKeys.syncStatus, {
      state: 'error',
      startedAt,
      completedAt: new Date(),
      issues: [UNKNOWN_RECONCILE_ISSUE],
    });
    if (__DEV__) console.warn('Notification reconciliation failed unexpectedly');
    return null;
  }
}

function summarizeIssues(issues: readonly ReconcileIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((summary, issue) => {
    summary[issue.stage] = (summary[issue.stage] ?? 0) + 1;
    return summary;
  }, {});
}
