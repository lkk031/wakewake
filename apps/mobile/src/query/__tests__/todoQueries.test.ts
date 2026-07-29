import { describe, expect, it, vi } from 'vitest';

vi.mock('@/providers/AppServicesProvider', () => ({ useAppServices: vi.fn() }));
vi.mock('../notificationQueries', () => ({ reconcileNotificationsSafely: vi.fn() }));

import { runTodoMutationFollowUp } from '../todoQueries';

describe('todo mutation follow-up', () => {
  it('starts query invalidation and notification reconciliation concurrently', async () => {
    let finishInvalidation!: () => void;
    let finishReconciliation!: () => void;
    const invalidation = new Promise<void>((resolve) => {
      finishInvalidation = resolve;
    });
    const reconciliation = new Promise<void>((resolve) => {
      finishReconciliation = resolve;
    });
    const invalidateTodoQueries = vi.fn(() => invalidation);
    const reconcileNotifications = vi.fn(() => reconciliation);

    const followUp = runTodoMutationFollowUp({
      invalidateTodoQueries,
      reconcileNotifications,
    });

    expect(invalidateTodoQueries).toHaveBeenCalledTimes(1);
    expect(reconcileNotifications).toHaveBeenCalledTimes(1);

    finishInvalidation();
    await Promise.resolve();
    let settled = false;
    void followUp.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishReconciliation();
    await expect(followUp).resolves.toBeUndefined();
  });

  it('preserves notification failure isolation', async () => {
    await expect(
      runTodoMutationFollowUp({
        invalidateTodoQueries: async () => undefined,
        reconcileNotifications: async () => null,
      }),
    ).resolves.toBeUndefined();
  });
});
