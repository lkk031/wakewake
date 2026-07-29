import { describe, expect, it } from 'vitest';

import {
  applyTodoTemplate,
  createTodoFormDefaults,
  getTodoFormReminderTimings,
  mapTodoForm,
  normalizeRemindersForTimingKind,
  todoSubmitErrorMessage,
} from '../todoForm';

const reminder = {
  id: '4c764f7d-bab5-4d78-a172-4d53c848caa8',
  anchor: 'due' as const,
  offsetMinutes: 10,
};
const generatedReminderId = '6f59a0bd-67dc-472a-b9d4-aa6d5dbc1846';
const createReminderId = () => generatedReminderId;

describe('todo form mapper', () => {
  it('creates a timed todo using the selected IANA timezone', () => {
    const values = createTodoFormDefaults('America/New_York', 30, [reminder], createReminderId, {
      now: new Date('2026-03-08T12:00:00Z'),
    });
    const todo = mapTodoForm(
      {
        ...values,
        title: '  DST meeting  ',
        date: '2026-03-08',
        startTime: '09:00',
        dueTime: '09:30',
      },
      'America/New_York',
      '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
    );
    expect(todo.title).toBe('DST meeting');
    expect(todo.reminders[0]?.id).toBe(generatedReminderId);
    expect(todo.timing.kind).toBe('timed');
    if (todo.timing.kind !== 'timed') throw new Error('Expected timed todo');
    expect(todo.timing.startAt?.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(todo.timing.dueAt?.toISOString()).toBe('2026-03-08T13:30:00.000Z');
  });

  it('creates independent reminder rules from the same default template', () => {
    const templates = [
      reminder,
      {
        id: '00000000-0000-4000-8000-000000000060',
        anchor: 'due' as const,
        offsetMinutes: 60,
      },
    ];
    const firstIds = [
      '0fe82cd2-2c25-4c15-89fd-89ac2de23609',
      '10336fcc-54de-4f6e-96a9-2442cdbe3246',
    ];
    const secondIds = [
      '5632e2cb-a96a-4c27-af58-9bef03b66db3',
      '2c666528-6294-4fa3-b7e2-0ef48a8ae619',
    ];
    const first = createTodoFormDefaults('UTC', 30, templates, () => firstIds.shift()!, {
      now: new Date('2026-07-26T09:00:00Z'),
    });
    const second = createTodoFormDefaults('UTC', 30, templates, () => secondIds.shift()!, {
      now: new Date('2026-07-26T09:00:00Z'),
    });

    expect(first.reminders.map((rule) => rule.offsetMinutes)).toEqual([10, 60]);
    expect(second.reminders.map((rule) => rule.offsetMinutes)).toEqual([10, 60]);
    expect(first.reminders.map((rule) => rule.id)).not.toEqual(
      second.reminders.map((rule) => rule.id),
    );
    expect(first.reminders).not.toBe(templates);
    expect(first.reminders[0]).not.toBe(templates[0]);
    expect(templates).toEqual([
      reminder,
      {
        id: '00000000-0000-4000-8000-000000000060',
        anchor: 'due' as const,
        offsetMinutes: 60,
      },
    ]);
  });

  it('preserves anchors while creating independent reminder rules', () => {
    const values = createTodoFormDefaults('UTC', 30, [reminder], createReminderId, {
      now: new Date('2026-07-26T09:00:00Z'),
    });

    expect(values.reminders).toEqual([{ ...reminder, id: generatedReminderId }]);
  });

  it('applies a template without changing the current title, date, or start time', () => {
    const values = createTodoFormDefaults('UTC', 30, [], createReminderId, {
      now: new Date('2026-07-26T23:10:00Z'),
    });
    const template = {
      id: '00000000-0000-4000-8001-000000000002',
      name: '作业截止',
      durationMinutes: 1_440,
      reminders: [
        {
          id: '00000000-0000-4000-8001-000000000201',
          anchor: 'due' as const,
          offsetMinutes: 1_440,
        },
        {
          id: '00000000-0000-4000-8001-000000000202',
          anchor: 'due' as const,
          offsetMinutes: 60,
        },
      ],
    };
    const generatedIds = [
      '0fe82cd2-2c25-4c15-89fd-89ac2de23609',
      '10336fcc-54de-4f6e-96a9-2442cdbe3246',
    ];
    const applied = applyTodoTemplate(
      { ...values, title: '数学作业', notes: '第二章', priority: 'high' },
      template,
      'UTC',
      () => generatedIds.shift()!,
    );

    expect(applied.title).toBe('数学作业');
    expect(applied.notes).toBe('第二章');
    expect(applied.priority).toBe('high');
    expect(applied.date).toBe('2026-07-26');
    expect(applied.startTime).toBe('23:30');
    expect(applied.dueDate).toBe('2026-07-27');
    expect(applied.dueTime).toBe('23:30');
    expect(applied.reminders.map((rule) => rule.id)).toEqual([
      '0fe82cd2-2c25-4c15-89fd-89ac2de23609',
      '10336fcc-54de-4f6e-96a9-2442cdbe3246',
    ]);
    expect(
      applied.reminders.map(({ anchor, offsetMinutes }) => ({ anchor, offsetMinutes })),
    ).toEqual([
      { anchor: 'due', offsetMinutes: 1_440 },
      { anchor: 'due', offsetMinutes: 60 },
    ]);
    expect(template.reminders.map((rule) => rule.id)).toEqual([
      '00000000-0000-4000-8001-000000000201',
      '00000000-0000-4000-8001-000000000202',
    ]);
  });

  it('calculates a template due time across a daylight-saving transition', () => {
    const values = createTodoFormDefaults('America/New_York', 30, [], createReminderId, {
      now: new Date('2026-03-08T05:30:00Z'),
      dateAnchor: '2026-03-08',
    });
    const applied = applyTodoTemplate(
      { ...values, startTime: '01:30' },
      {
        id: '00000000-0000-4000-8001-000000000001',
        name: '会议',
        durationMinutes: 60,
        reminders: [],
      },
      'America/New_York',
      createReminderId,
    );

    expect(applied.date).toBe('2026-03-08');
    expect(applied.startTime).toBe('01:30');
    expect(applied.dueDate).toBe('2026-03-08');
    expect(applied.dueTime).toBe('03:30');
  });

  it('normalizes all-day reminders to start and prefers existing start IDs', () => {
    const rules = normalizeRemindersForTimingKind(
      [
        { ...reminder, id: '4c764f7d-bab5-4d78-a172-4d53c848caa8' },
        {
          id: '6f59a0bd-67dc-472a-b9d4-aa6d5dbc1846',
          anchor: 'start',
          offsetMinutes: 10,
        },
        {
          id: '5632e2cb-a96a-4c27-af58-9bef03b66db3',
          anchor: 'due',
          offsetMinutes: 60,
        },
      ],
      'allDay',
    );

    expect(rules).toEqual([
      {
        id: '6f59a0bd-67dc-472a-b9d4-aa6d5dbc1846',
        anchor: 'start',
        offsetMinutes: 10,
      },
      {
        id: '5632e2cb-a96a-4c27-af58-9bef03b66db3',
        anchor: 'start',
        offsetMinutes: 60,
      },
    ]);
  });

  it('clears reminders when moved to the inbox', () => {
    const values = createTodoFormDefaults('UTC', 30, [reminder], createReminderId, {
      now: new Date('2026-07-26T09:00:00Z'),
    });
    const todo = mapTodoForm(
      { ...values, title: 'Inbox', timingKind: 'unscheduled' },
      'UTC',
      '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
    );
    expect(todo.timing).toEqual({ kind: 'unscheduled' });
    expect(todo.reminders).toEqual([]);
    expect(todo.recurrence).toBeNull();
  });

  it('supports a timed todo that crosses midnight', () => {
    const values = createTodoFormDefaults('UTC', 60, [], createReminderId, {
      now: new Date('2026-07-26T23:10:00Z'),
    });
    const todo = mapTodoForm(
      { ...values, title: 'Night task' },
      'UTC',
      '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
    );
    expect(todo.timing.kind).toBe('timed');
    if (todo.timing.kind !== 'timed') throw new Error('Expected timed todo');
    expect(todo.timing.startAt?.toISOString()).toBe('2026-07-26T23:30:00.000Z');
    expect(todo.timing.dueAt?.toISOString()).toBe('2026-07-27T00:30:00.000Z');
  });

  it('anchors the default date while preserving the rounded time and duration', () => {
    const values = createTodoFormDefaults('UTC', 30, [], createReminderId, {
      now: new Date('2026-07-27T09:10:00Z'),
      dateAnchor: '2026-07-28',
    });

    expect(values.date).toBe('2026-07-28');
    expect(values.startTime).toBe('09:30');
    expect(values.dueDate).toBe('2026-07-28');
    expect(values.dueTime).toBe('10:00');
    expect(values.allDayEndDate).toBe('2026-07-29');
  });

  it('derives the next due date when an anchored default crosses midnight', () => {
    const values = createTodoFormDefaults('UTC', 60, [], createReminderId, {
      now: new Date('2026-07-27T23:10:00Z'),
      dateAnchor: '2026-07-28',
    });

    expect(values.date).toBe('2026-07-28');
    expect(values.startTime).toBe('23:30');
    expect(values.dueDate).toBe('2026-07-29');
    expect(values.dueTime).toBe('00:30');
  });

  it('anchors the date using the selected IANA timezone wall clock', () => {
    const values = createTodoFormDefaults('America/New_York', 30, [], createReminderId, {
      now: new Date('2026-07-27T13:10:00Z'),
      dateAnchor: '2026-07-28',
    });

    expect(values.date).toBe('2026-07-28');
    expect(values.startTime).toBe('09:30');
    expect(values.dueDate).toBe('2026-07-28');
    expect(values.dueTime).toBe('10:00');
  });

  it('calculates start and due reminder timings independently', () => {
    const values = createTodoFormDefaults('Asia/Shanghai', 60, [], createReminderId, {
      now: new Date('2026-07-27T00:00:00.000Z'),
      dateAnchor: '2026-07-27',
    });
    const timings = getTodoFormReminderTimings(
      {
        ...values,
        startTime: '09:00',
        dueTime: '10:00',
        reminders: [
          { ...reminder, anchor: 'start', offsetMinutes: 10 },
          {
            id: '00000000-0000-4000-8000-000000000060',
            anchor: 'due',
            offsetMinutes: 60,
          },
        ],
      },
      'Asia/Shanghai',
      new Date('2026-07-27T00:30:00.000Z'),
    );

    expect(timings.map((timing) => timing.scheduledAt.toISOString())).toEqual([
      '2026-07-27T00:50:00.000Z',
      '2026-07-27T01:00:00.000Z',
    ]);
    expect(timings.map((timing) => timing.expired)).toEqual([false, false]);
  });

  it('marks reminder timings at or before now as expired', () => {
    const values = createTodoFormDefaults('UTC', 30, [], createReminderId, {
      now: new Date('2026-07-27T08:00:00.000Z'),
    });
    const timings = getTodoFormReminderTimings(
      {
        ...values,
        date: '2026-07-27',
        startTime: '09:00',
        dueDate: '2026-07-27',
        dueTime: '09:30',
        reminders: [
          { ...reminder, anchor: 'start', offsetMinutes: 60 },
          {
            id: '00000000-0000-4000-8000-000000000060',
            anchor: 'due',
            offsetMinutes: 30,
          },
        ],
      },
      'UTC',
      new Date('2026-07-27T09:00:00.000Z'),
    );

    expect(timings.map((timing) => timing.expired)).toEqual([true, true]);
  });

  it('uses the saved timezone 09:00 for all-day reminder timings', () => {
    const values = createTodoFormDefaults('Asia/Shanghai', 30, [], createReminderId, {
      now: new Date('2026-07-27T00:00:00.000Z'),
      dateAnchor: '2026-07-28',
    });
    const timings = getTodoFormReminderTimings(
      {
        ...values,
        timingKind: 'allDay',
        reminders: [{ ...reminder, anchor: 'start', offsetMinutes: 60 }],
      },
      'Asia/Shanghai',
      new Date('2026-07-27T00:00:00.000Z'),
    );

    expect(timings[0]?.scheduledAt.toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });

  it('rejects a due time before the start time on the same date', () => {
    const values = createTodoFormDefaults('UTC', 30, [], createReminderId, {
      now: new Date('2026-07-26T09:00:00Z'),
    });
    expect(() =>
      mapTodoForm(
        {
          ...values,
          title: 'Invalid',
          startTime: '10:00',
          dueDate: values.date,
          dueTime: '09:00',
        },
        'UTC',
        '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
      ),
    ).toThrow();
  });

  it('hides raw SQLite constraint details from the form', () => {
    const message = todoSubmitErrorMessage(
      new Error(
        "Call to function 'NativeStatement.finalizeAsync' has been rejected. UNIQUE constraint failed: reminder_rules.id",
      ),
    );

    expect(message).toBe('提醒数据发生冲突，保存失败，请重试');
    expect(message).not.toMatch(/UNIQUE|reminder_rules|NativeStatement/);
    expect(todoSubmitErrorMessage(new Error('重复系列的频率不能修改'))).toBe(
      '重复系列的频率不能修改',
    );
  });
});
