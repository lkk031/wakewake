import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { NotificationCoordinator } from '../../services/notifications/NotificationCoordinator';
import { reconcileNotificationsSafely } from '../notificationReconciliation';

describe('safe notification reconciliation', () => {
  it('awaits coordinator completion and forwards force re-arm', async () => {
    vi.stubGlobal('__DEV__', false);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = {
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
    const reconcile = vi.fn(async () => {
      await pending;
      return result;
    });
    const coordinator = { reconcile } as unknown as NotificationCoordinator;
    const queryClient = new QueryClient();
    let settled = false;

    const promise = reconcileNotificationsSafely(coordinator, queryClient, {
      forceRearm: true,
    }).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();

    await expect(promise).resolves.toBe(result);
    expect(reconcile).toHaveBeenCalledWith(expect.any(Date), { forceRearm: true });
  });

  it('absorbs reconciliation failure instead of turning it into data failure', async () => {
    vi.stubGlobal('__DEV__', false);
    const coordinator = {
      reconcile: vi.fn(async () => {
        throw new Error('native failure');
      }),
    } as unknown as NotificationCoordinator;

    await expect(reconcileNotificationsSafely(coordinator, new QueryClient())).resolves.toBeNull();
  });
});
