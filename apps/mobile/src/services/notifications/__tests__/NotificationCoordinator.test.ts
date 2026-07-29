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
  reminders: [{ id: '4c764f7d-bab5-4d78-a172-4d53c848caa8', anchor: 'due', offsetMinutes: 60 }],
  recurrence: null,
  completedAt: null,
  version: 1,
};

function createHarness(
  options: {
    permission?: boolean;
    channelState?: 'enabled' | 'blocked';
    nativeScheduleFails?: boolean;
    mappingUpsertFails?: boolean;
    supported?: boolean;
    todos?: Todo[];
  } = {},
) {
  const mappings = new Map<string, ScheduledNotification>();
  const native = new Map<string, string>();
  const todos = [...(options.todos ?? [todo])];
  let identifier = 0;
  let permissionGranted = options.permission !== false;
  let pendingTodoRead: Promise<void> | null = null;
  const todoRepository = {
    listAll: vi.fn(async () => {
      const snapshot = [...todos];
      const pending = pendingTodoRead;
      pendingTodoRead = null;
      if (pending !== null) await pending;
      return snapshot;
    }),
    listOccurrenceStates: vi.fn(async () => []),
  } as unknown as TodoRepository;
  const notificationRepository = {
    listAll: vi.fn(async () => [...mappings.values()]),
    remove: vi.fn(async (key: string) => mappings.delete(key)),
    upsert: vi.fn(async (value: NewScheduledNotification) => {
      if (options.mappingUpsertFails) throw new Error('mapping failed');
      const persisted = { ...value, createdAt: new Date() };
      mappings.set(value.logicalKey, persisted);
      return persisted;
    }),
  } as unknown as NotificationRepository;
  const adapter: NotificationNativeAdapter = {
    supported: options.supported !== false,
    ensureChannel: vi.fn(async () => undefined),
    getPermissionState: vi.fn(async () => ({
      status: permissionGranted ? ('granted' as const) : ('denied' as const),
      granted: permissionGranted,
      canAskAgain: !permissionGranted,
      channelState: options.channelState ?? ('enabled' as const),
    })),
    requestPermission: vi.fn(async () => {
      permissionGranted = true;
      return {
        status: 'granted' as const,
        granted: true,
        canAskAgain: true,
        channelState: 'enabled' as const,
      };
    }),
    listScheduled: vi.fn(async () =>
      [...native.entries()].map(([nativeId, logicalKey]) => ({ identifier: nativeId, logicalKey })),
    ),
    schedule: vi.fn(async (desired, existingIdentifier?: string | undefined) => {
      if (options.nativeScheduleFails) throw new Error('native failed');
      const nativeId = existingIdentifier ?? `native-${++identifier}`;
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
    todos,
    deferNextTodoRead(promise: Promise<void>) {
      pendingTodoRead = promise;
    },
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
      issues: [],
      skippedForPermission: false,
      plannedCount: 0,
      skippedExpiredCount: 0,
      missingTargetCount: 0,
      truncatedCount: 0,
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

  it('schedules separate native requests for todos with identical reminder times', async () => {
    const otherTodo: Todo = {
      ...todo,
      id: '1548de51-d521-4932-9989-ef52c8a855eb',
      title: 'Prepare',
    };
    const harness = createHarness({ todos: [todo, otherTodo] });

    const result = await harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z'));

    expect(result).toMatchObject({ plannedCount: 2, scheduled: 2, failed: 0 });
    expect(harness.adapter.schedule).toHaveBeenCalledTimes(2);
    expect(harness.native.size).toBe(2);
    expect(new Set(harness.native.values())).toHaveLength(2);
    expect([...harness.native.values()]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`|${todo.id}|`),
        expect.stringContaining(`|${otherTodo.id}|`),
      ]),
    );
  });

  it('reports a blocked reminder channel without inspecting notification data', async () => {
    const harness = createHarness({ channelState: 'blocked' });

    await expect(
      harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z')),
    ).resolves.toMatchObject({
      scheduled: 0,
      failed: 1,
      issues: [expect.objectContaining({ stage: 'channel' })],
    });
    expect(harness.todoRepository.listAll).not.toHaveBeenCalled();
  });

  it('skips scheduling when permission is denied', async () => {
    const harness = createHarness({ permission: false });
    expect(await harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z'))).toMatchObject(
      { skippedForPermission: true, scheduled: 0 },
    );
    expect(harness.adapter.schedule).not.toHaveBeenCalled();
  });

  it('schedules every future request after permission changes from denied to granted', async () => {
    const otherTodo: Todo = {
      ...todo,
      id: '1548de51-d521-4932-9989-ef52c8a855eb',
      title: 'Prepare',
    };
    const harness = createHarness({ permission: false, todos: [todo, otherTodo] });
    const now = new Date('2026-07-27T08:00:00.000Z');

    await expect(harness.coordinator.reconcile(now)).resolves.toMatchObject({
      skippedForPermission: true,
      plannedCount: 0,
      scheduled: 0,
    });
    await expect(harness.coordinator.requestPermission()).resolves.toMatchObject({ granted: true });
    await expect(harness.coordinator.reconcile(now)).resolves.toMatchObject({
      skippedForPermission: false,
      plannedCount: 2,
      scheduled: 2,
      failed: 0,
    });

    expect(harness.adapter.schedule).toHaveBeenCalledTimes(2);
    expect(harness.native.size).toBe(2);
    expect(harness.mappings.size).toBe(2);
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

  it('lets a queued reconciliation observe a todo added during the active run', async () => {
    const harness = createHarness();
    const now = new Date('2026-07-27T08:00:00.000Z');
    let releaseTodoRead!: () => void;
    const todoReadBlocked = new Promise<void>((resolve) => {
      releaseTodoRead = resolve;
    });
    harness.deferNextTodoRead(todoReadBlocked);

    const first = harness.coordinator.reconcile(now);
    await vi.waitFor(() => expect(harness.todoRepository.listAll).toHaveBeenCalledTimes(1));
    const otherTodo: Todo = {
      ...todo,
      id: '1548de51-d521-4932-9989-ef52c8a855eb',
      title: 'Prepare',
    };
    harness.todos.push(otherTodo);
    expect(harness.coordinator.reconcile(now)).toBe(first);
    releaseTodoRead();

    await expect(first).resolves.toMatchObject({ scheduled: 2, plannedCount: 2, failed: 0 });
    expect(harness.todoRepository.listAll).toHaveBeenCalledTimes(2);
    expect(harness.adapter.schedule).toHaveBeenCalledTimes(2);
    expect(harness.native.size).toBe(2);
    expect([...harness.native.values()]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`|${todo.id}|`),
        expect.stringContaining(`|${otherTodo.id}|`),
      ]),
    );
  });

  it('cancels an edited todo stale request and retains only its new schedule', async () => {
    const harness = createHarness();
    const now = new Date('2026-07-27T08:00:00.000Z');
    await harness.coordinator.reconcile(now);
    const oldLogicalKey = [...harness.native.values()][0]!;
    const oldNativeId = [...harness.native.keys()][0]!;
    harness.todos[0] = {
      ...todo,
      timing: {
        kind: 'timed',
        startAt: new Date('2026-07-27T09:00:00.000Z'),
        dueAt: new Date('2026-07-27T11:30:00.000Z'),
        timezone: 'UTC',
      },
    };

    const result = await harness.coordinator.reconcile(now);

    const expectedLogicalKey = `wakewake-v2|${todo.id}|single|due|${todo.reminders[0]!.id}|2026-07-27T10:30:00.000Z`;
    expect(result).toMatchObject({ scheduled: 1, cancelled: 1, removedMappings: 1, failed: 0 });
    expect(harness.adapter.cancel).toHaveBeenCalledWith(oldNativeId);
    expect(harness.native.size).toBe(1);
    expect([...harness.native.values()]).toEqual([expectedLogicalKey]);
    expect([...harness.mappings.keys()]).toEqual([expectedLogicalKey]);
    expect(harness.native.has(oldNativeId)).toBe(false);
    expect(harness.mappings.has(oldLogicalKey)).toBe(false);
    expect(harness.mappings.get(expectedLogicalKey)?.scheduledAt).toEqual(
      new Date('2026-07-27T10:30:00.000Z'),
    );
  });

  it('force re-arms an existing schedule with the same native identifier', async () => {
    const harness = createHarness();
    const now = new Date('2026-07-27T08:00:00.000Z');
    await harness.coordinator.reconcile(now);
    vi.mocked(harness.adapter.schedule).mockClear();

    await harness.coordinator.reconcile(now, { forceRearm: true });

    expect(harness.adapter.schedule).toHaveBeenCalledTimes(1);
    expect(harness.adapter.schedule).toHaveBeenCalledWith(expect.any(Object), 'native-1');
    expect(harness.adapter.cancel).not.toHaveBeenCalled();
    expect(harness.mappings.size).toBe(1);
    expect(harness.native.size).toBe(1);
  });

  it('removes stale state when a forced re-arm fails', async () => {
    const harness = createHarness();
    const now = new Date('2026-07-27T08:00:00.000Z');
    await harness.coordinator.reconcile(now);
    vi.mocked(harness.adapter.schedule).mockRejectedValueOnce(new Error('native failed'));

    const result = await harness.coordinator.reconcile(now, { forceRearm: true });

    expect(result).toMatchObject({ scheduled: 0, cancelled: 1, removedMappings: 1, failed: 1 });
    expect(result.issues).toEqual([
      expect.objectContaining({ stage: 'scheduling', logicalKey: expect.any(String) }),
    ]);
    expect(harness.mappings.size).toBe(0);
    expect(harness.native.size).toBe(0);

    await expect(harness.coordinator.reconcile(now)).resolves.toMatchObject({
      scheduled: 1,
      failed: 0,
    });
    expect(harness.mappings.size).toBe(1);
    expect(harness.native.size).toBe(1);
  });

  it('preserves a queued force re-arm while a normal run is active', async () => {
    const harness = createHarness();
    const now = new Date('2026-07-27T08:00:00.000Z');
    await harness.coordinator.reconcile(now);
    vi.mocked(harness.adapter.schedule).mockClear();

    const first = harness.coordinator.reconcile(now);
    expect(harness.coordinator.reconcile(now, { forceRearm: true })).toBe(first);
    await first;

    expect(harness.adapter.listScheduled).toHaveBeenCalledTimes(3);
    expect(harness.adapter.schedule).toHaveBeenCalledWith(expect.any(Object), 'native-1');
  });

  it('cancels a native request when mapping persistence fails', async () => {
    const harness = createHarness({ mappingUpsertFails: true });
    const result = await harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z'));

    expect(result).toMatchObject({ scheduled: 0, cancelled: 1, failed: 1 });
    expect(result.issues).toEqual([
      expect.objectContaining({ stage: 'mapping-persistence', logicalKey: expect.any(String) }),
    ]);
    expect(harness.native.size).toBe(0);
    expect(harness.adapter.cancel).toHaveBeenCalledTimes(1);
  });

  it('returns issues from a serialized follow-up run', async () => {
    const harness = createHarness();
    vi.mocked(harness.adapter.listScheduled)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('enumeration failed'));
    const now = new Date('2026-07-27T08:00:00.000Z');

    const first = harness.coordinator.reconcile(now);
    expect(harness.coordinator.reconcile(now)).toBe(first);

    await expect(first).resolves.toMatchObject({
      scheduled: 1,
      failed: 1,
      issues: [expect.objectContaining({ stage: 'native-enumeration' })],
    });
  });

  it('replaces legacy v1 schedules through normal reconciliation', async () => {
    const harness = createHarness();
    const logicalKey = `wakewake-v1|${todo.id}|single|${todo.reminders[0]!.id}|2026-07-27T09:00:00.000Z`;
    harness.mappings.set(logicalKey, {
      logicalKey,
      nativeNotificationId: 'native-v1',
      todoId: todo.id,
      occurrenceKey: null,
      reminderRuleId: todo.reminders[0]!.id,
      scheduledAt: new Date('2026-07-27T09:00:00.000Z'),
      createdAt: new Date('2026-07-26T09:00:00.000Z'),
    });
    harness.native.set('native-v1', logicalKey);

    const result = await harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z'));

    expect(result).toMatchObject({ scheduled: 1, cancelled: 1, removedMappings: 1 });
    expect([...harness.mappings.keys()]).toEqual([
      `wakewake-v2|${todo.id}|single|due|${todo.reminders[0]!.id}|2026-07-27T09:00:00.000Z`,
    ]);
  });

  it('counts native scheduling failure without rejecting reconciliation', async () => {
    const harness = createHarness({ nativeScheduleFails: true });
    await expect(
      harness.coordinator.reconcile(new Date('2026-07-27T08:00:00.000Z')),
    ).resolves.toMatchObject({
      scheduled: 0,
      failed: 1,
      issues: [
        expect.objectContaining({
          stage: 'scheduling',
          todoId: todo.id,
          reminderRuleId: todo.reminders[0]!.id,
          anchor: 'due',
        }),
      ],
    });
  });
});
