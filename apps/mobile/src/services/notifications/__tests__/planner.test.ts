import { DEFAULT_REMINDER_TEMPLATES, type OccurrenceState, type Todo } from '@wakewake/domain';
import { describe, expect, it } from 'vitest';

import { planNotifications } from '../planner';

const reminderId = '4c764f7d-bab5-4d78-a172-4d53c848caa8';
const baseTodo: Todo = {
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
  reminders: [{ id: reminderId, anchor: 'due', offsetMinutes: 60 }],
  recurrence: null,
  completedAt: null,
  version: 1,
};

describe('notification planner', () => {
  it('plans future reminders and excludes completed todos', () => {
    const now = new Date('2026-07-27T08:00:00.000Z');
    const planned = planNotifications([baseTodo], [], { now });
    expect(planned.notifications).toHaveLength(1);
    expect(planned.notifications[0]).toMatchObject({
      todoId: baseTodo.id,
      occurrenceKey: null,
      reminderRuleId: reminderId,
      anchor: 'due',
      scheduledAt: new Date('2026-07-27T09:00:00.000Z'),
    });
    expect(planned.notifications[0]?.logicalKey).toBe(
      `wakewake-v2|${baseTodo.id}|single|due|${reminderId}|2026-07-27T09:00:00.000Z`,
    );
    expect(planned).toMatchObject({
      plannedCount: 1,
      skippedExpiredCount: 0,
      missingTargetCount: 0,
      truncatedCount: 0,
    });
    expect(
      planNotifications(
        [{ ...baseTodo, status: 'completed', completedAt: new Date('2026-07-27T08:00:00Z') }],
        [],
        { now },
      ).notifications,
    ).toEqual([]);
  });

  it('expands through the maximum reminder offset beyond the scheduling horizon', () => {
    const todo: Todo = {
      ...baseTodo,
      timing: {
        kind: 'timed',
        startAt: new Date('2026-08-28T09:00:00.000Z'),
        dueAt: new Date('2026-08-28T10:00:00.000Z'),
        timezone: 'UTC',
      },
      reminders: [{ id: reminderId, anchor: 'due', offsetMinutes: 3 * 1_440 }],
      recurrence: { frequency: 'daily', interval: 1, end: { kind: 'never' } },
    };
    const planned = planNotifications([todo], [], {
      now: new Date('2026-07-26T00:00:00.000Z'),
      horizonDays: 31,
    });

    expect(
      planned.notifications.some(
        (item) =>
          item.occurrenceKey === '2026-08-28T09:00:00' &&
          item.scheduledAt.toISOString() === '2026-08-25T10:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('omits completed recurring occurrences', () => {
    const todo: Todo = {
      ...baseTodo,
      recurrence: { frequency: 'daily', interval: 1, end: { kind: 'never' } },
    };
    const state: OccurrenceState = {
      todoId: todo.id,
      occurrenceKey: '2026-07-28T09:00:00',
      status: 'completed',
      completedAt: new Date('2026-07-28T08:00:00.000Z'),
      version: 1,
    };
    const planned = planNotifications([todo], [state], {
      now: new Date('2026-07-27T08:00:00.000Z'),
      horizonDays: 2,
    });

    expect(planned.notifications.map((item) => item.occurrenceKey)).not.toContain(
      '2026-07-28T09:00:00',
    );
  });

  it('keeps logical keys unique when two todos share a scheduled time', () => {
    const otherTodo: Todo = {
      ...baseTodo,
      id: '1548de51-d521-4932-9989-ef52c8a855eb',
      title: 'Prepare',
    };

    const planned = planNotifications([baseTodo, otherTodo], [], {
      now: new Date('2026-07-27T08:00:00.000Z'),
    });

    expect(planned.notifications).toHaveLength(2);
    expect(planned.notifications.map(({ scheduledAt }) => scheduledAt.toISOString())).toEqual([
      '2026-07-27T09:00:00.000Z',
      '2026-07-27T09:00:00.000Z',
    ]);
    expect(new Set(planned.notifications.map(({ logicalKey }) => logicalKey))).toHaveLength(2);
    expect(planned.notifications.map(({ logicalKey }) => logicalKey)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`|${baseTodo.id}|`),
        expect.stringContaining(`|${otherTodo.id}|`),
      ]),
    );
  });

  it('treats a reminder scheduled exactly now as expired', () => {
    const planned = planNotifications([baseTodo], [], {
      now: new Date('2026-07-27T09:00:00.000Z'),
    });

    expect(planned.notifications).toEqual([]);
    expect(planned).toMatchObject({ plannedCount: 0, skippedExpiredCount: 1 });
  });

  it('reports every expired default due reminder for a near-future todo', () => {
    const todo: Todo = {
      ...baseTodo,
      timing: {
        kind: 'timed',
        startAt: new Date('2026-07-27T08:30:00.000Z'),
        dueAt: new Date('2026-07-27T08:35:00.000Z'),
        timezone: 'UTC',
      },
      reminders: DEFAULT_REMINDER_TEMPLATES.map((template, index) => ({
        id: [
          '697a566d-11c8-4af9-a63f-ef3bc892adbc',
          '770432eb-99a2-4dc2-87e3-d1a5bfbe051c',
          'e7663c83-e0b0-48cc-a1a7-c6c64da2d255',
        ][index]!,
        ...template,
      })),
    };

    const planned = planNotifications([todo], [], {
      now: new Date('2026-07-27T08:30:00.000Z'),
    });

    expect(planned.notifications).toEqual([]);
    expect(planned).toMatchObject({ plannedCount: 0, skippedExpiredCount: 3 });
  });

  it('changes the target logical key and scheduled time when timing is edited', () => {
    const now = new Date('2026-07-27T08:00:00.000Z');
    const original = planNotifications([baseTodo], [], { now }).notifications[0]!;
    const edited = planNotifications(
      [
        {
          ...baseTodo,
          timing: {
            kind: 'timed',
            startAt: new Date('2026-07-27T09:00:00.000Z'),
            dueAt: new Date('2026-07-27T11:30:00.000Z'),
            timezone: 'UTC',
          },
        },
      ],
      [],
      { now },
    ).notifications[0]!;

    expect(edited.scheduledAt).toEqual(new Date('2026-07-27T10:30:00.000Z'));
    expect(edited.logicalKey).not.toBe(original.logicalKey);
    expect(edited.logicalKey).toBe(
      `wakewake-v2|${baseTodo.id}|single|due|${reminderId}|2026-07-27T10:30:00.000Z`,
    );
  });

  it('uses each rule anchor and reports expired or missing targets', () => {
    const todo: Todo = {
      ...baseTodo,
      timing: {
        kind: 'timed',
        startAt: new Date('2026-07-27T09:00:00.000Z'),
        dueAt: null,
        timezone: 'UTC',
      },
      reminders: [
        { id: reminderId, anchor: 'start', offsetMinutes: 0 },
        {
          id: '913972a4-94cc-4827-9d70-d837405f8e0f',
          anchor: 'due',
          offsetMinutes: 0,
        },
      ],
    };

    const planned = planNotifications([todo], [], {
      now: new Date('2026-07-27T09:00:00.000Z'),
    });

    expect(planned.notifications).toEqual([]);
    expect(planned.skippedExpiredCount).toBe(1);
    expect(planned.missingTargetCount).toBe(1);
  });

  it('anchors all-day reminders to 09:00 in the saved timezone', () => {
    const todo: Todo = {
      ...baseTodo,
      timing: {
        kind: 'allDay',
        startDate: '2026-07-28',
        endDateExclusive: '2026-07-29',
        timezone: 'Asia/Shanghai',
      },
      reminders: [{ id: reminderId, anchor: 'start', offsetMinutes: 60 }],
    };

    const planned = planNotifications([todo], [], {
      now: new Date('2026-07-27T00:00:00.000Z'),
    });

    expect(planned.notifications[0]?.scheduledAt.toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });

  it('enforces the managed notification limit', () => {
    const planned = planNotifications(
      [{ ...baseTodo, recurrence: { frequency: 'daily', interval: 1, end: { kind: 'never' } } }],
      [],
      { now: new Date('2026-07-27T08:00:00.000Z'), horizonDays: 10, maxNotifications: 2 },
    );
    expect(planned.notifications).toHaveLength(2);
    expect(planned.plannedCount).toBe(2);
    expect(planned.truncatedCount).toBeGreaterThan(0);
    expect(planned.truncated).toBe(true);
  });
});
