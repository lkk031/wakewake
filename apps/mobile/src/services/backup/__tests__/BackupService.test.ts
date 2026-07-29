import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  PREVIOUS_BACKUP_VERSION,
  createDefaultTodoTemplates,
  type BackupV3,
} from '@wakewake/domain';
import { describe, expect, it } from 'vitest';

import { parseBackup, serializeBackup } from '../backupFormat';

const backup: BackupV3 = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: new Date('2026-07-26T10:00:00.000Z'),
  todos: [
    {
      id: '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
      title: 'Backup todo',
      notes: '',
      categoryId: null,
      priority: 'none',
      status: 'open',
      timing: { kind: 'unscheduled' },
      reminders: [],
      recurrence: null,
      completedAt: null,
      version: 1,
    },
  ],
  occurrenceStates: [],
  settings: {
    themeMode: 'dark',
    timezoneMode: 'system',
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    weekStartsOn: 1,
    defaultDurationMinutes: 30,
  },
  defaultReminders: [],
  templates: [
    {
      id: '00000000-0000-4000-8001-000000000010',
      name: 'Custom second',
      durationMinutes: 45,
      reminders: [
        {
          id: '00000000-0000-4000-8001-000000000110',
          anchor: 'due',
          offsetMinutes: 15,
        },
        {
          id: '00000000-0000-4000-8001-000000000111',
          anchor: 'start',
          offsetMinutes: 15,
        },
      ],
    },
    {
      id: '00000000-0000-4000-8001-000000000011',
      name: 'Custom first',
      durationMinutes: 20,
      reminders: [],
    },
  ],
};

describe('backup JSON helpers', () => {
  it('round-trips dates and theme settings through JSON', () => {
    const restored = parseBackup(serializeBackup(backup));
    expect(restored.exportedAt).toEqual(backup.exportedAt);
    expect(restored.todos).toEqual(backup.todos);
    expect(restored.settings.themeMode).toBe('dark');
    expect(restored.templates).toEqual(backup.templates);
  });

  it('contextually normalizes legacy reminder anchors', () => {
    const legacy = {
      ...JSON.parse(serializeBackup(backup)),
      version: 1,
      templates: undefined,
      todos: [
        {
          ...backup.todos[0],
          timing: {
            kind: 'timed',
            startAt: '2026-07-26T09:00:00.000Z',
            dueAt: '2026-07-26T10:00:00.000Z',
            timezone: 'UTC',
          },
          reminders: [{ id: '00000000-0000-4000-8000-000000000010', offsetMinutes: 10 }],
        },
        {
          ...backup.todos[0],
          id: '00000000-0000-4000-8000-000000000002',
          timing: {
            kind: 'timed',
            startAt: '2026-07-27T09:00:00.000Z',
            dueAt: null,
            timezone: 'UTC',
          },
          reminders: [{ id: '00000000-0000-4000-8000-000000000020', offsetMinutes: 20 }],
        },
        {
          ...backup.todos[0],
          id: '00000000-0000-4000-8000-000000000003',
          timing: {
            kind: 'allDay',
            startDate: '2026-07-28',
            endDateExclusive: '2026-07-29',
            timezone: 'UTC',
          },
          reminders: [{ id: '00000000-0000-4000-8000-000000000030', offsetMinutes: 30 }],
        },
      ],
      defaultReminders: [{ id: '00000000-0000-4000-8000-000000000060', offsetMinutes: 60 }],
    };
    const settings = legacy.settings as Record<string, unknown>;
    delete settings.themeMode;

    const restored = parseBackup(JSON.stringify(legacy));
    expect(restored.version).toBe(BACKUP_VERSION);
    expect(restored.todos.map((todo) => todo.reminders[0]?.anchor)).toEqual([
      'due',
      'start',
      'start',
    ]);
    expect(restored.defaultReminders[0]?.anchor).toBe('due');
    expect(restored.settings.themeMode).toBe('system');
    expect(restored.templates).toEqual(createDefaultTodoTemplates());
  });

  it('normalizes V2 without changing its reminder anchors', () => {
    const v2 = JSON.parse(serializeBackup(backup)) as Record<string, unknown>;
    v2.version = PREVIOUS_BACKUP_VERSION;
    delete v2.templates;

    const restored = parseBackup(JSON.stringify(v2));
    expect(restored.version).toBe(BACKUP_VERSION);
    expect(restored.templates).toEqual(createDefaultTodoTemplates());
    expect(restored.todos).toEqual(backup.todos);
    expect(restored.defaultReminders).toEqual(backup.defaultReminders);
  });

  it('round-trips distinct anchors at the same offset', () => {
    const anchored = {
      ...backup,
      todos: [
        {
          ...backup.todos[0]!,
          timing: {
            kind: 'timed' as const,
            startAt: new Date('2026-07-26T09:00:00.000Z'),
            dueAt: new Date('2026-07-26T10:00:00.000Z'),
            timezone: 'UTC',
          },
          reminders: [
            {
              id: '00000000-0000-4000-8000-000000000010',
              anchor: 'start' as const,
              offsetMinutes: 10,
            },
            {
              id: '00000000-0000-4000-8000-000000000011',
              anchor: 'due' as const,
              offsetMinutes: 10,
            },
          ],
        },
      ],
    };
    expect(parseBackup(serializeBackup(anchored)).todos[0]?.reminders).toEqual(
      anchored.todos[0]?.reminders,
    );
  });

  it('rejects invalid JSON and unknown versions', () => {
    expect(() => parseBackup('{bad')).toThrow('not valid JSON');
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 4 }))).toThrow();
  });

  it('does not serialize native notification mappings', () => {
    const json = serializeBackup(backup);
    expect(json).not.toContain('nativeNotificationId');
    expect(json).not.toContain('scheduled_notifications');
  });
});
