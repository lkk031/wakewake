import type { OccurrenceState, Todo } from '@wakewake/domain';
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
  reminders: [{ id: reminderId, offsetMinutes: 60 }],
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
      scheduledAt: new Date('2026-07-27T09:00:00.000Z'),
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
      reminders: [{ id: reminderId, offsetMinutes: 3 * 1_440 }],
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

  it('enforces the managed notification limit', () => {
    const planned = planNotifications(
      [{ ...baseTodo, recurrence: { frequency: 'daily', interval: 1, end: { kind: 'never' } } }],
      [],
      { now: new Date('2026-07-27T08:00:00.000Z'), horizonDays: 10, maxNotifications: 2 },
    );
    expect(planned.notifications).toHaveLength(2);
    expect(planned.truncated).toBe(true);
  });
});
