import { BACKUP_FORMAT, BACKUP_VERSION, type BackupV1 } from '@wakewake/domain';
import { describe, expect, it } from 'vitest';

import { parseBackup, serializeBackup } from '../backupFormat';

const backup: BackupV1 = {
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
};

describe('backup JSON helpers', () => {
  it('round-trips dates and theme settings through JSON', () => {
    const restored = parseBackup(serializeBackup(backup));
    expect(restored.exportedAt).toEqual(backup.exportedAt);
    expect(restored.todos).toEqual(backup.todos);
    expect(restored.settings.themeMode).toBe('dark');
  });

  it('defaults legacy backups without a theme setting to system', () => {
    const legacy = JSON.parse(serializeBackup(backup)) as Record<string, unknown>;
    const settings = legacy.settings as Record<string, unknown>;
    delete settings.themeMode;

    expect(parseBackup(JSON.stringify(legacy)).settings.themeMode).toBe('system');
  });

  it('rejects invalid JSON and unknown versions', () => {
    expect(() => parseBackup('{bad')).toThrow('not valid JSON');
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow();
  });

  it('does not serialize native notification mappings', () => {
    const json = serializeBackup(backup);
    expect(json).not.toContain('nativeNotificationId');
    expect(json).not.toContain('scheduled_notifications');
  });
});
