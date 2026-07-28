import { BACKUP_FORMAT, BACKUP_VERSION, type BackupV1 } from '@wakewake/domain';
import { describe, expect, it } from 'vitest';

import { validateBackupIntegrity } from '../../../services/backup/backupFormat';

const backup: BackupV1 = {
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

  it('rejects category references unsupported by V1 backups', () => {
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
});
