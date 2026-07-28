import type { Todo } from '@wakewake/domain';
import { describe, expect, it, vi } from 'vitest';

import type {
  NewScheduledNotification,
  NotificationRepository,
} from '@/db/repositories/NotificationRepository';
import type { ScheduledNotification } from '@/db/rowMappers';
import type { TodoRepository } from '@/db/repositories/TodoRepository';
import { NotificationCoordinator } from '../NotificationCoordinator';
import type { NotificationNativeAdapter } from '../nativeAdapter';

const todo: Todo = {
  id: '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
  title: 'Review',
  notes: '',
  categoryId: null,
  priority: 'none',
  status: 'open',
  timing: {
    kind: 'timed',
    startAt: new Date('2026-07-27T09:00:00.000Z'),
    dueAt: new Date('2026-07-27T10:00:00.000Z'),
    timezone: 'UTC',
  },
  reminders: [{ id: '4c764f7d-bab5-4d78-a172-4d53c848caa8', offsetMinutes: 60 }],
  recurrence: null,
  completedAt: null,
  version: 1,
};

function createHarness(
  options: { permission?: boolean; nativeScheduleFails?: boolean; supported?: boolean } = {},
) {
  const mappings = new Map<string, ScheduledNotification>();
  const native = new Map<string, string>();
  let identifier = 0;
  const todoRepository = {
    listAll: vi.fn(async () => [todo]),
    listOccurrenceStates: vi.fn(async () => []),
  } as unknown as TodoRepository;
  const notificationRepository = {
    listAll: vi.fn(async () => [...mappings.values()]),
    remove: vi.fn(async (key: string) => mappings.delete(key)),
    upsert: vi.fn(async (value: NewScheduledNotification) => {
      const persisted = { ...value, createdAt: new Date() };
      mappings.set(value.logicalKey, persisted);
      return persisted;
    }),
  } as unknown as NotificationRepository;
  const adapter: NotificationNativeAdapter = {
    supported: options.supported !== false,
    ensureChannel: vi.fn(async () => undefined),
    getPermissionState: vi.fn(async () => ({
      status: options.permission === false ? ('denied' as const) : ('granted' as const),
      granted: options.permission !== false,
      canAskAgain: options.permission === false,
    })),
    requestPermission: vi.fn(async () => ({
      status: 'granted' as const,
      granted: true,
      canAskAgain: true,
    })),
    listScheduled: vi.fn(async () =>
      [...native.entries()].map(([nativeId, logicalKey]) => ({ identifier: nativeId, logicalKey })),
    ),
    schedule: vi.fn(async (desired) => {
      if (options.nativeScheduleFails) throw new Error('native failed');
      const nativeId = `native-${++identifier}`;
      native.set(nativeId, desired.logicalKey);
      return nativeId;
    }),
    scheduleTest: vi.fn(async () => `test-${++identifier}`),
    cancel: vi.fn(async (nativeId) => {
      native.delete(nativeId);
    }),
  };
  return {
    coordinator: new NotificationCoordinator(todoRepository, notificationRepository, adapter),
    todoRepository,
    notificationRepository,
    adapter,
    mappings,
    native,
  };
}

describe('notification coordinator', () => {
  it('does not inspect repositories in an unsupported runtime', async () => {
    const harness = createHarness({ supported: false });

    await expect(
      harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z')),
    ).resolves.toEqual({
      scheduled: 0,
      cancelled: 0,
      removedMappings: 0,
      failed: 0,
      skippedForPermission: false,
      truncated: false,
    });
    expect(harness.todoRepository.listAll).not.toHaveBeenCalled();
    expect(harness.todoRepository.listOccurrenceStates).not.toHaveBeenCalled();
    expect(harness.notificationRepository.listAll).not.toHaveBeenCalled();
    expect(harness.adapter.ensureChannel).not.toHaveBeenCalled();
    expect(harness.adapter.listScheduled).not.toHaveBeenCalled();
  });

  it('schedules once and remains idempotent', async () => {
    const harness = createHarness();
    const now = new Date('2026-07-27T08:00:00.000Z');
    expect(await harness.coordinator.reconcile(now)).toMatchObject({ scheduled: 1, failed: 0 });
    expect(await harness.coordinator.reconcile(now)).toMatchObject({ scheduled: 0, failed: 0 });
    expect(harness.adapter.schedule).toHaveBeenCalledTimes(1);
    expect(harness.mappings.size).toBe(1);
    expect(harness.native.size).toBe(1);
  });

  it('skips scheduling when permission is denied', async () => {
    const harness = createHarness({ permission: false });
    expect(await harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z'))).toMatchObject(
      { skippedForPermission: true, scheduled: 0 },
    );
    expect(harness.adapter.schedule).not.toHaveBeenCalled();
  });

  it('cleans existing schedules when permission is denied', async () => {
    const harness = createHarness({ permission: false });
    const logicalKey = 'old-key';
    harness.mappings.set(logicalKey, {
      logicalKey,
      nativeNotificationId: 'native-old',
      todoId: todo.id,
      occurrenceKey: null,
      reminderRuleId: todo.reminders[0]!.id,
      scheduledAt: new Date('2026-07-27T09:00:00.000Z'),
      createdAt: new Date('2026-07-26T09:00:00.000Z'),
    });
    harness.native.set('native-old', logicalKey);
    await expect(
      harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z')),
    ).resolves.toMatchObject({ skippedForPermission: true, cancelled: 1, removedMappings: 1 });
    expect(harness.mappings.size).toBe(0);
    expect(harness.native.size).toBe(0);
  });

  it('queues a follow-up reconciliation when a run is already active', async () => {
    const harness = createHarness();
    const now = new Date('2026-07-27T08:00:00.000Z');
    const first = harness.coordinator.reconcile(now);
    const second = harness.coordinator.reconcile(now);
    expect(second).toBe(first);
    await first;
    expect(harness.adapter.listScheduled).toHaveBeenCalledTimes(2);
  });

  it('counts native scheduling failure without rejecting reconciliation', async () => {
    const harness = createHarness({ nativeScheduleFails: true });
    await expect(
      harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z')),
    ).resolves.toMatchObject({ scheduled: 0, failed: 1 });
  });
});
