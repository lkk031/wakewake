import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  LEGACY_BACKUP_VERSION,
  BackupSchema,
  BackupV2Schema,
  BackupV3Schema,
  PREVIOUS_BACKUP_VERSION,
  createDefaultTodoTemplates,
  calculateReminderAt,
  expandOccurrences,
  getFutureReminderTimes,
  getReminderBase,
  isOverdue,
  OccurrenceStateSchema,
  RecurrenceRuleSchema,
  TodoSchema,
} from '../index';

const id = '6fca9198-7c59-4f03-84c0-d14b796bbdf1';
const secondId = 'a469916e-4eaf-467c-b8c7-4123a594ce93';

function todo(overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: '事项',
    categoryId: null,
    timing: { kind: 'unscheduled' },
    ...overrides,
  };
}

const daily = { frequency: 'daily', interval: 1, end: { kind: 'never' } } as const;

describe('TodoSchema', () => {
  it('accepts an unscheduled inbox item without reminders', () => {
    expect(TodoSchema.safeParse(todo()).success).toBe(true);
  });

  it('rejects reminders and recurrence on an unscheduled item', () => {
    expect(
      TodoSchema.safeParse(todo({ reminders: [{ id, anchor: 'due', offsetMinutes: 10 }] })).success,
    ).toBe(false);
    expect(TodoSchema.safeParse(todo({ recurrence: daily })).success).toBe(false);
  });

  it('rejects a due time before its start time and invalid IANA zones', () => {
    const value = todo({
      timing: {
        kind: 'timed',
        startAt: '2026-07-24T10:00:00Z',
        dueAt: '2026-07-24T09:00:00Z',
        timezone: 'Not/A_Zone',
      },
    });

    expect(TodoSchema.safeParse(value).success).toBe(false);
  });

  it('enforces status/completedAt consistency', () => {
    expect(TodoSchema.safeParse(todo({ completedAt: '2026-07-24T10:00:00Z' })).success).toBe(false);
    expect(TodoSchema.safeParse(todo({ status: 'completed' })).success).toBe(false);
    expect(
      TodoSchema.safeParse(todo({ status: 'completed', completedAt: '2026-07-24T10:00:00Z' }))
        .success,
    ).toBe(true);
  });

  it('rejects completion of a recurring series', () => {
    const result = TodoSchema.safeParse(
      todo({
        status: 'completed',
        completedAt: '2026-07-24T10:00:00Z',
        timing: {
          kind: 'allDay',
          startDate: '2026-07-24',
          endDateExclusive: '2026-07-25',
          timezone: 'Asia/Shanghai',
        },
        recurrence: daily,
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe('RecurrenceRuleSchema', () => {
  it('supports only V1 daily/weekly interval-one never-ending rules', () => {
    expect(RecurrenceRuleSchema.safeParse(daily).success).toBe(true);
    expect(RecurrenceRuleSchema.safeParse({ ...daily, interval: 2 }).success).toBe(false);
    expect(
      RecurrenceRuleSchema.safeParse({
        frequency: 'monthly',
        interval: 1,
        end: { kind: 'never' },
      }).success,
    ).toBe(false);
    expect(
      RecurrenceRuleSchema.safeParse({
        frequency: 'daily',
        interval: 1,
        end: { kind: 'count', count: 2 },
      }).success,
    ).toBe(false);
  });

  it('deduplicates and canonically sorts weekly weekdays', () => {
    const result = RecurrenceRuleSchema.parse({
      frequency: 'weekly',
      interval: 1,
      end: { kind: 'never' },
      weekdays: [5, 1, 5, 0, 1],
    });
    expect(result).toEqual({
      frequency: 'weekly',
      interval: 1,
      end: { kind: 'never' },
      weekdays: [0, 1, 5],
    });
  });
});

describe('reminders', () => {
  it('uses exact minute offsets and skips past reminders', () => {
    const base = new Date('2026-07-24T12:00:00Z');
    expect(calculateReminderAt(base, 60).toISOString()).toBe('2026-07-24T11:00:00.000Z');
    expect(
      getFutureReminderTimes(
        base,
        [{ offsetMinutes: 60 }, { offsetMinutes: 10 }],
        new Date('2026-07-24T11:30:00Z'),
      ).map((date) => date.toISOString()),
    ).toEqual(['2026-07-24T11:50:00.000Z']);
  });

  it('resolves only the selected timed anchor target', () => {
    const startAt = new Date('2026-07-24T10:00:00Z');
    const dueAt = new Date('2026-07-24T11:00:00Z');
    const timing = { kind: 'timed' as const, startAt, dueAt, timezone: 'Asia/Shanghai' };
    expect(getReminderBase(timing, 'start')).toBe(startAt);
    expect(getReminderBase(timing, 'due')).toBe(dueAt);
    expect(getReminderBase({ ...timing, dueAt: null }, 'due')).toBeNull();
    expect(getReminderBase({ startAt, dueAt: null }, 'start')).toBe(startAt);
    expect(getReminderBase({ kind: 'unscheduled' })).toBeNull();
  });

  it('allows equal offsets on different anchors but rejects duplicate anchor-offset pairs', () => {
    const startRule = { id, anchor: 'start' as const, offsetMinutes: 10 };
    const dueRule = { id: secondId, anchor: 'due' as const, offsetMinutes: 10 };
    const timing = {
      kind: 'timed' as const,
      startAt: '2026-07-24T10:00:00Z',
      dueAt: '2026-07-24T11:00:00Z',
      timezone: 'UTC',
    };
    expect(TodoSchema.safeParse(todo({ timing, reminders: [startRule, dueRule] })).success).toBe(
      true,
    );
    expect(
      TodoSchema.safeParse(
        todo({ timing, reminders: [startRule, { ...dueRule, anchor: 'start' }] }),
      ).success,
    ).toBe(false);
  });

  it('requires each reminder anchor target and permits only all-day start reminders', () => {
    const startRule = { id, anchor: 'start' as const, offsetMinutes: 10 };
    const dueRule = { id, anchor: 'due' as const, offsetMinutes: 10 };
    expect(
      TodoSchema.safeParse(
        todo({
          timing: { kind: 'timed', startAt: null, dueAt: '2026-07-24T11:00:00Z', timezone: 'UTC' },
          reminders: [startRule],
        }),
      ).success,
    ).toBe(false);
    const allDay = {
      kind: 'allDay' as const,
      startDate: '2026-07-24',
      endDateExclusive: '2026-07-25',
      timezone: 'UTC',
    };
    expect(TodoSchema.safeParse(todo({ timing: allDay, reminders: [startRule] })).success).toBe(
      true,
    );
    expect(TodoSchema.safeParse(todo({ timing: allDay, reminders: [dueRule] })).success).toBe(
      false,
    );
  });

  it('uses local 09:00 as the all-day base across DST', () => {
    expect(
      getReminderBase(
        {
          kind: 'allDay',
          startDate: '2026-03-08',
          endDateExclusive: '2026-03-09',
          timezone: 'America/New_York',
        },
        'start',
      )?.toISOString(),
    ).toBe('2026-03-08T13:00:00.000Z');
    expect(
      getReminderBase(
        {
          kind: 'allDay',
          startDate: '2026-11-01',
          endDateExclusive: '2026-11-02',
          timezone: 'America/New_York',
        },
        'start',
      )?.toISOString(),
    ).toBe('2026-11-01T14:00:00.000Z');
  });
});

describe('isOverdue', () => {
  it('uses dueAt for timed todos and excludes the exact boundary', () => {
    const parsed = TodoSchema.parse(
      todo({
        timing: {
          kind: 'timed',
          startAt: null,
          dueAt: '2026-07-24T10:00:00Z',
          timezone: 'UTC',
        },
      }),
    );
    expect(isOverdue(parsed, new Date('2026-07-24T10:00:00Z'))).toBe(false);
    expect(isOverdue(parsed, new Date('2026-07-24T10:00:00.001Z'))).toBe(true);
  });

  it('applies the all-day timezone and exclusive end date', () => {
    const parsed = TodoSchema.parse(
      todo({
        timing: {
          kind: 'allDay',
          startDate: '2026-03-08',
          endDateExclusive: '2026-03-09',
          timezone: 'America/New_York',
        },
      }),
    );
    expect(isOverdue(parsed, new Date('2026-03-09T03:59:59Z'))).toBe(false);
    expect(isOverdue(parsed, new Date('2026-03-09T04:00:00Z'))).toBe(true);
  });
});

describe('occurrences', () => {
  it('expands all-day daily occurrences over a finite cross-year window', () => {
    const occurrences = expandOccurrences(
      {
        todoId: id,
        timing: {
          kind: 'allDay',
          startDate: '2026-12-30',
          endDateExclusive: '2026-12-31',
          timezone: 'Pacific/Auckland',
        },
        recurrence: daily,
      },
      { start: new Date('2026-12-30T00:00:00Z'), end: new Date('2027-01-02T00:00:00Z') },
    );
    expect(occurrences.map((occurrence) => occurrence.occurrenceKey)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('expands sorted weekly weekdays and respects half-open boundaries', () => {
    const recurrence = RecurrenceRuleSchema.parse({
      frequency: 'weekly',
      interval: 1,
      end: { kind: 'never' },
      weekdays: [5, 1, 1],
    });
    const occurrences = expandOccurrences(
      {
        todoId: id,
        timing: {
          kind: 'allDay',
          startDate: '2026-12-28',
          endDateExclusive: '2026-12-29',
          timezone: 'UTC',
        },
        recurrence,
      },
      { start: new Date('2026-12-28T00:00:00Z'), end: new Date('2027-01-05T00:00:00Z') },
    );
    expect(occurrences.map((occurrence) => occurrence.occurrenceKey)).toEqual([
      '2026-12-28',
      '2027-01-01',
      '2027-01-04',
    ]);
  });

  it('keeps timed wall-clock keys and times stable through DST start', () => {
    const occurrences = expandOccurrences(
      {
        todoId: id,
        timing: {
          kind: 'timed',
          startAt: new Date('2026-03-07T14:00:00Z'),
          dueAt: new Date('2026-03-07T14:30:00Z'),
          timezone: 'America/New_York',
        },
        recurrence: daily,
      },
      { start: new Date('2026-03-07T00:00:00Z'), end: new Date('2026-03-10T00:00:00Z') },
    );
    expect(occurrences.map((occurrence) => occurrence.occurrenceKey)).toEqual([
      '2026-03-07T09:00:00',
      '2026-03-08T09:00:00',
      '2026-03-09T09:00:00',
    ]);
    expect(
      occurrences.map((occurrence) =>
        occurrence.timing.kind === 'timed' ? occurrence.timing.startAt?.toISOString() : null,
      ),
    ).toEqual(['2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z']);
  });

  it('chooses the first repeated wall time at DST fall-back', () => {
    const occurrences = expandOccurrences(
      {
        todoId: id,
        timing: {
          kind: 'timed',
          startAt: new Date('2026-10-31T05:30:00Z'),
          dueAt: null,
          timezone: 'America/New_York',
        },
        recurrence: daily,
      },
      { start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-11-02T00:00:00Z') },
    );
    expect(occurrences[0]?.occurrenceKey).toBe('2026-11-01T01:30:00');
    expect(
      occurrences[0]?.timing.kind === 'timed' ? occurrences[0].timing.startAt?.toISOString() : null,
    ).toBe('2026-11-01T05:30:00.000Z');
  });

  it('requires a valid bounded window', () => {
    expect(() =>
      expandOccurrences(
        {
          todoId: id,
          timing: {
            kind: 'allDay',
            startDate: '2026-01-01',
            endDateExclusive: '2026-01-02',
            timezone: 'UTC',
          },
          recurrence: daily,
        },
        { start: new Date('2026-01-02T00:00:00Z'), end: new Date('2026-01-01T00:00:00Z') },
      ),
    ).toThrow(RangeError);
  });
});

describe('occurrence state and backup', () => {
  it('enforces occurrence status/completedAt consistency', () => {
    expect(
      OccurrenceStateSchema.safeParse({
        todoId: id,
        occurrenceKey: '2026-07-24',
        status: 'completed',
      }).success,
    ).toBe(false);
    expect(
      OccurrenceStateSchema.safeParse({
        todoId: id,
        occurrenceKey: '2026-07-24',
        status: 'cancelled',
        completedAt: '2026-07-24T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('parses legacy and current portable backups with distinct reminder schemas', () => {
    const envelope = {
      format: BACKUP_FORMAT,
      exportedAt: '2026-07-26T00:00:00Z',
      todos: [todo({ id: secondId })],
      occurrenceStates: [],
      settings: { timezone: 'Asia/Shanghai' },
    };
    const legacy = {
      ...envelope,
      version: LEGACY_BACKUP_VERSION,
      defaultReminders: [{ id, offsetMinutes: 10 }],
    };
    const v2 = {
      ...envelope,
      version: PREVIOUS_BACKUP_VERSION,
      defaultReminders: [{ id, anchor: 'due', offsetMinutes: 10 }],
    };
    const current = {
      ...v2,
      version: BACKUP_VERSION,
      templates: createDefaultTodoTemplates(),
    };
    expect(BackupSchema.parse(legacy).version).toBe(1);
    expect(BackupV2Schema.parse(v2).version).toBe(2);
    const result = BackupV3Schema.parse(current);
    expect(result.version).toBe(3);
    expect(result.exportedAt).toBeInstanceOf(Date);
    expect(result.settings.themeMode).toBe('system');
    expect(
      BackupV3Schema.safeParse({ ...current, defaultReminders: legacy.defaultReminders }).success,
    ).toBe(false);
    expect(BackupSchema.safeParse({ ...current, nativeNotificationMappings: [] }).success).toBe(
      false,
    );
    expect(BackupSchema.safeParse({ ...current, version: 4 }).success).toBe(false);
    expect(BackupSchema.safeParse({ ...current, format: 'other-backup' }).success).toBe(false);
  });
});
