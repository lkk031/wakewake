import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createDefaultTodoTemplates,
  type BackupV3,
  type Todo,
} from '@wakewake/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@/services/backup/backupFormat', async () => {
  const { BackupV3Schema } = await import('@wakewake/domain');
  return { validateBackupIntegrity: BackupV3Schema.parse };
});

import type { DatabaseExecutor, TransactionDatabase } from '../../transaction';
import { BackupRepository } from '../BackupRepository';
import { SettingsRepository } from '../SettingsRepository';
import { TodoRepository } from '../TodoRepository';

const todo: Todo = {
  id: '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
  title: 'Reminder anchors',
  notes: '',
  categoryId: null,
  priority: 'none',
  status: 'open',
  timing: {
    kind: 'timed',
    startAt: new Date('2026-07-26T01:00:00.000Z'),
    dueAt: new Date('2026-07-26T02:00:00.000Z'),
    timezone: 'Asia/Shanghai',
  },
  reminders: [
    {
      id: 'bf5283e4-36f6-4c4e-bf2b-1785a02b1127',
      anchor: 'start',
      offsetMinutes: 10,
    },
    {
      id: '4614c7fb-9e11-4f3a-8580-552f97fd5acb',
      anchor: 'due',
      offsetMinutes: 10,
    },
  ],
  recurrence: null,
  completedAt: null,
  version: 1,
};

function createDatabase(getAllRows: unknown[] = []) {
  const runAsync = vi.fn<DatabaseExecutor['runAsync']>(async () => ({
    changes: 1,
    lastInsertRowId: 1,
  }));
  const database: TransactionDatabase = {
    execAsync: vi.fn(async () => undefined),
    runAsync,
    getFirstAsync: vi.fn(async () => null) as DatabaseExecutor['getFirstAsync'],
    getAllAsync: vi.fn(async (source: string) =>
      source.includes('PRAGMA foreign_key_check') ? [] : getAllRows,
    ) as DatabaseExecutor['getAllAsync'],
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  };
  return { database, runAsync };
}

function findRun(
  runAsync: ReturnType<typeof vi.fn>,
  sqlFragment: string,
): [string, readonly unknown[]] {
  const call = runAsync.mock.calls.find(([source]) => String(source).includes(sqlFragment));
  if (call === undefined) throw new Error(`SQL call not found: ${sqlFragment}`);
  return call as [string, readonly unknown[]];
}

describe('reminder repository persistence', () => {
  it('writes todo reminder anchors and permits the same offset on distinct anchors', async () => {
    const { database, runAsync } = createDatabase();
    await new TodoRepository(database).create(todo, new Date('2026-07-26T00:00:00.000Z'));

    const reminderCalls = runAsync.mock.calls.filter(([source]) =>
      String(source).includes('INSERT INTO reminder_rules'),
    );
    expect(reminderCalls).toHaveLength(2);
    expect(reminderCalls[0]?.[1]).toEqual([todo.reminders[0]!.id, todo.id, 'start', 10, 0]);
    expect(reminderCalls[1]?.[1]).toEqual([todo.reminders[1]!.id, todo.id, 'due', 10, 1]);
  });

  it('reads and writes default reminder anchors', async () => {
    const rows = [
      {
        id: todo.reminders[0]!.id,
        anchor: 'start',
        offset_minutes: 10,
        sort_order: 0,
      },
      {
        id: todo.reminders[1]!.id,
        anchor: 'due',
        offset_minutes: 10,
        sort_order: 1,
      },
    ];
    const { database, runAsync } = createDatabase(rows);
    const repository = new SettingsRepository(database);

    await expect(repository.getDefaultReminders()).resolves.toEqual(todo.reminders);
    await repository.setDefaultReminders(todo.reminders);

    const [, firstParams] = findRun(runAsync, 'INSERT INTO default_reminder_rules');
    expect(firstParams).toEqual([todo.reminders[0]!.id, 'start', 10, 0]);
  });

  it('restores todo and default reminder anchors from backups', async () => {
    const backup: BackupV3 = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date('2026-07-26T10:00:00.000Z'),
      todos: [todo],
      occurrenceStates: [],
      settings: {
        themeMode: 'system',
        timezoneMode: 'system',
        timezone: 'Asia/Shanghai',
        locale: 'zh-CN',
        weekStartsOn: 1,
        defaultDurationMinutes: 30,
      },
      defaultReminders: [todo.reminders[1]!],
      templates: createDefaultTodoTemplates(),
    };
    const { database, runAsync } = createDatabase();

    await new BackupRepository(database).replaceAll(backup, new Date('2026-07-26T11:00:00.000Z'));

    const [, todoReminderParams] = findRun(runAsync, 'INSERT INTO reminder_rules');
    expect(todoReminderParams).toEqual([todo.reminders[0]!.id, todo.id, 'start', 10, 0]);
    const [, defaultReminderParams] = findRun(runAsync, 'INSERT INTO default_reminder_rules');
    expect(defaultReminderParams).toEqual([todo.reminders[1]!.id, 'due', 10, 0]);
  });
});
