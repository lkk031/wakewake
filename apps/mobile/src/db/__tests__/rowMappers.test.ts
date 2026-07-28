import { describe, expect, it } from 'vitest';

import {
  mapSettingsRow,
  mapTodoRow,
  todoToPersistence,
  type SettingsRow,
  type TodoRow,
} from '../rowMappers';

const baseRow: TodoRow = {
  id: '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
  title: '  DB round trip  ',
  notes: '',
  category_id: null,
  priority: 'high',
  status: 'open',
  timing_kind: 'timed',
  start_at: '2026-07-26T01:00:00.000Z',
  due_at: '2026-07-26T02:00:00.000Z',
  all_day_start_date: null,
  all_day_end_date_exclusive: null,
  timezone: 'Asia/Shanghai',
  recurrence_json: null,
  completed_at: null,
  version: 1,
  created_at: '2026-07-25T00:00:00.000Z',
  updated_at: '2026-07-25T00:00:00.000Z',
  deleted_at: null,
};

describe('settings row mapper', () => {
  const row: SettingsRow = {
    theme_mode: 'dark',
    timezone_mode: 'system',
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    week_starts_on: 1,
    default_duration_minutes: 30,
  };

  it('maps persisted theme modes', () => {
    expect(mapSettingsRow(row).themeMode).toBe('dark');
    expect(mapSettingsRow({ ...row, theme_mode: 'system' }).themeMode).toBe('system');
    expect(mapSettingsRow({ ...row, theme_mode: 'light' }).themeMode).toBe('light');
  });

  it('rejects an invalid persisted theme mode', () => {
    expect(() => mapSettingsRow({ ...row, theme_mode: 'sepia' })).toThrow();
  });
});

describe('todo row mappers', () => {
  it('validates and normalizes rows with the domain schema', () => {
    const todo = mapTodoRow(baseRow, [
      {
        id: 'bf5283e4-36f6-4c4e-bf2b-1785a02b1127',
        todo_id: baseRow.id,
        offset_minutes: 10,
        sort_order: 0,
      },
    ]);

    expect(todo.title).toBe('DB round trip');
    expect(todo.timing.kind).toBe('timed');
    if (todo.timing.kind !== 'timed') throw new Error('Expected timed todo');
    expect(todo.timing.startAt).toEqual(new Date('2026-07-26T01:00:00.000Z'));
    expect(todo.reminders).toEqual([
      { id: 'bf5283e4-36f6-4c4e-bf2b-1785a02b1127', offsetMinutes: 10 },
    ]);

    expect(todoToPersistence(todo)).toMatchObject({
      title: 'DB round trip',
      timingKind: 'timed',
      startAt: '2026-07-26T01:00:00.000Z',
      dueAt: '2026-07-26T02:00:00.000Z',
      timezone: 'Asia/Shanghai',
    });
  });

  it('rejects persisted rows that violate domain constraints', () => {
    expect(() =>
      mapTodoRow(
        {
          ...baseRow,
          timing_kind: 'unscheduled',
          start_at: null,
          due_at: null,
          timezone: null,
        },
        [
          {
            id: 'bf5283e4-36f6-4c4e-bf2b-1785a02b1127',
            offset_minutes: 10,
            sort_order: 0,
          },
        ],
      ),
    ).toThrow();
  });
});
