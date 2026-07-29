import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createDefaultTodoTemplates,
  type BackupV3,
} from '@wakewake/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@/services/backup/backupFormat', async () => {
  const { BackupV3Schema } = await import('@wakewake/domain');
  return { validateBackupIntegrity: BackupV3Schema.parse };
});

import type { DatabaseExecutor, TransactionDatabase } from '../../transaction';
import { BackupRepository } from '../BackupRepository';
import { validateBackupIntegrity } from '../../../services/backup/backupFormat';

const backup: BackupV3 = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: new Date('2026-07-26T10:00:00.000Z'),
  todos: [
    {
      id: '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
      title: 'Todo',
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
    timezone: 'UTC',
    locale: 'zh-CN',
    weekStartsOn: 1,
    defaultDurationMinutes: 30,
  },
  defaultReminders: [],
  templates: createDefaultTodoTemplates().reverse(),
};

describe('backup integrity validation', () => {
  it('accepts a valid backup', () => {
    expect(validateBackupIntegrity(backup)).toEqual(backup);
  });

  it('rejects duplicate todo IDs and orphan occurrence states', () => {
    expect(() =>
      validateBackupIntegrity({ ...backup, todos: [...backup.todos, backup.todos[0]!] }),
    ).toThrow('duplicate todo IDs');
    expect(() =>
      validateBackupIntegrity({
        ...backup,
        occurrenceStates: [
          {
            todoId: '655535dd-a4b1-4a38-84e7-0552f5f03fa8',
            occurrenceKey: '2026-07-26',
            status: 'open',
            completedAt: null,
            version: 1,
          },
        ],
      }),
    ).toThrow('references missing todo');
  });

  it('rejects category references unsupported by WakeWake backups', () => {
    expect(() =>
      validateBackupIntegrity({
        ...backup,
        todos: [
          {
            ...backup.todos[0]!,
            categoryId: '655535dd-a4b1-4a38-84e7-0552f5f03fa8',
          },
        ],
      }),
    ).toThrow('cannot contain categories');
  });

  it('rejects duplicate template and template reminder IDs', () => {
    expect(() =>
      validateBackupIntegrity({
        ...backup,
        templates: [
          ...backup.templates,
          { ...backup.templates[0]!, name: 'Duplicate ID with unique name' },
        ],
      }),
    ).toThrow('duplicate template IDs');
    expect(() =>
      validateBackupIntegrity({
        ...backup,
        templates: backup.templates.map((template, index) =>
          index === 1
            ? {
                ...template,
                reminders: [backup.templates[0]!.reminders[0]!],
              }
            : template,
        ),
      }),
    ).toThrow('duplicate template reminder IDs');
  });
});

function createDatabase(options: { templateRows?: unknown[]; reminderRows?: unknown[] } = {}) {
  const runAsync = vi.fn<DatabaseExecutor['runAsync']>(async () => ({
    changes: 1,
    lastInsertRowId: 1,
  }));
  const database: TransactionDatabase = {
    execAsync: vi.fn(async () => undefined),
    runAsync,
    getFirstAsync: vi.fn(async (source: string) => {
      if (source.includes('app_settings')) {
        return {
          id: 1,
          theme_mode: backup.settings.themeMode,
          timezone_mode: backup.settings.timezoneMode,
          timezone: backup.settings.timezone,
          locale: backup.settings.locale,
          week_starts_on: backup.settings.weekStartsOn,
          default_duration_minutes: backup.settings.defaultDurationMinutes,
          updated_at: '2026-07-26T00:00:00.000Z',
        };
      }
      return null;
    }) as DatabaseExecutor['getFirstAsync'],
    getAllAsync: vi.fn(async (source: string) => {
      if (source.includes('todo_template_reminder_rules')) return options.reminderRows ?? [];
      if (source.includes('todo_templates')) return options.templateRows ?? [];
      return [];
    }) as DatabaseExecutor['getAllAsync'],
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  };
  return { database, runAsync };
}

function findRuns(runAsync: ReturnType<typeof vi.fn>, sqlFragment: string) {
  return runAsync.mock.calls.filter(([source]) => String(source).includes(sqlFragment));
}

describe('BackupRepository template persistence', () => {
  it('exports templates and reminders in persisted order', async () => {
    const first = backup.templates[0]!;
    const second = backup.templates[1]!;
    const templateRows = [first, second].map((template, sort_order) => ({
      id: template.id,
      name: template.name,
      duration_minutes: template.durationMinutes,
      sort_order,
    }));
    const reminderRows = backup.templates.flatMap((template) =>
      template.reminders.map((reminder, sort_order) => ({
        id: reminder.id,
        template_id: template.id,
        anchor: reminder.anchor,
        offset_minutes: reminder.offsetMinutes,
        sort_order,
      })),
    );
    const { database } = createDatabase({ templateRows, reminderRows });

    const exported = await new BackupRepository(database).createBackup(backup.exportedAt);

    expect(exported.templates).toEqual(backup.templates);
    expect(database.withTransactionAsync).toHaveBeenCalledOnce();
  });

  it('restores templates and reminder order in the same transaction', async () => {
    const { database, runAsync } = createDatabase();

    await new BackupRepository(database).replaceAll(backup, new Date('2026-07-26T11:00:00.000Z'));

    expect(database.withTransactionAsync).toHaveBeenCalledOnce();
    expect(findRuns(runAsync, 'INSERT INTO todo_templates').map((call) => call[1])).toEqual(
      backup.templates.map((template, sortOrder) => [
        template.id,
        template.name,
        template.durationMinutes,
        sortOrder,
      ]),
    );
    expect(
      findRuns(runAsync, 'INSERT INTO todo_template_reminder_rules').map((call) => call[1]),
    ).toEqual(
      backup.templates.flatMap((template) =>
        template.reminders.map((reminder, sortOrder) => [
          reminder.id,
          template.id,
          reminder.anchor,
          reminder.offsetMinutes,
          sortOrder,
        ]),
      ),
    );
  });
});
