import { describe, expect, it } from 'vitest';

import type { ReconcileResult } from '@/services/notifications/NotificationCoordinator';
import { notificationPermissionLabel, notificationSyncLabel } from '../notificationStatus';

const emptyResult: ReconcileResult = {
  scheduled: 0,
  cancelled: 0,
  removedMappings: 0,
  failed: 0,
  issues: [],
  skippedForPermission: false,
  plannedCount: 0,
  skippedExpiredCount: 0,
  missingTargetCount: 0,
  truncatedCount: 0,
  truncated: false,
};

describe('notification settings status', () => {
  it('distinguishes a blocked channel from global permission', () => {
    expect(
      notificationPermissionLabel({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        channelState: 'blocked',
      }),
    ).toBe('已允许 · 事项提醒类别已关闭');
  });

  it('explains when every reminder time has passed', () => {
    expect(
      notificationSyncLabel({
        state: 'success',
        startedAt: new Date(),
        completedAt: new Date(),
        result: { ...emptyResult, skippedExpiredCount: 3 },
      }),
    ).toBe('无未来有效提醒 · 3 条提醒时间已过');
  });

  it('reports future-valid and newly registered reminders without promising delivery', () => {
    expect(
      notificationSyncLabel({
        state: 'success',
        startedAt: new Date(),
        completedAt: new Date(),
        result: { ...emptyResult, plannedCount: 2, scheduled: 2 },
      }),
    ).toBe('未来有效 2 条 · 本次登记 2 条');
  });

  it('surfaces operation failures as repairable', () => {
    expect(
      notificationSyncLabel({
        state: 'success',
        startedAt: new Date(),
        completedAt: new Date(),
        result: { ...emptyResult, failed: 1 },
      }),
    ).toBe('1 个操作失败 · 点击修复');
  });
});
