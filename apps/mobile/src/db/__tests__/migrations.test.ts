import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('__DEV__', false);
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-sqlite', () => ({}));

import type { DatabaseExecutor, TransactionDatabase } from '../transaction';
import { LATEST_DATABASE_VERSION, runMigrations } from '../migrations';

function createDatabase(
  options: { initialVersion?: number; failInsert?: boolean; failTheme?: boolean } = {},
) {
  let version = options.initialVersion ?? 0;
  let transactionSnapshot = 0;
  const executed: string[] = [];
  const database: TransactionDatabase = {
    execAsync: vi.fn(async (source: string) => {
      executed.push(source);
      if (options.failTheme && source.includes('ADD COLUMN theme_mode')) {
        throw new Error('injected theme migration failure');
      }
      const versionMatch = /PRAGMA user_version = (\d+)/.exec(source);
      if (versionMatch?.[1]) version = Number(versionMatch[1]);
    }),
    runAsync: vi.fn(async (source: string) => {
      executed.push(source);
      if (options.failInsert && source.includes('INSERT INTO app_settings')) {
        throw new Error('injected migration failure');
      }
      return { changes: 1, lastInsertRowId: 1 };
    }),
    getFirstAsync: vi.fn(async (source: string) => {
      if (source.includes('PRAGMA user_version')) return { user_version: version };
      if (source.includes('COUNT(*)') && source.includes('todo_template_reminder_rules')) {
        return { count: 3 };
      }
      if (source.includes('COUNT(*)') && source.includes('todo_templates')) return { count: 2 };
      return null;
    }) as DatabaseExecutor['getFirstAsync'],
    getAllAsync: vi.fn(async () => []) as DatabaseExecutor['getAllAsync'],
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => {
      transactionSnapshot = version;
      try {
        await task();
      } catch (error) {
        version = transactionSnapshot;
        throw error;
      }
    }),
  };
  return { database, executed, getVersion: () => version };
}

describe('database migrations', () => {
  it('upgrades an empty database and remains idempotent', async () => {
    const harness = createDatabase();
    await runMigrations(harness.database);
    expect(harness.getVersion()).toBe(LATEST_DATABASE_VERSION);
    const callsAfterUpgrade = harness.executed.length;
    await runMigrations(harness.database);
    expect(harness.executed).toHaveLength(callsAfterUpgrade);
  });

  it('upgrades a version 1 database through the reminder anchor migration', async () => {
    const harness = createDatabase({ initialVersion: 1 });
    await runMigrations(harness.database);

    expect(harness.getVersion()).toBe(4);
    expect(harness.executed.some((source) => source.includes('ADD COLUMN theme_mode'))).toBe(true);
    expect(harness.executed.some((source) => source.includes('CREATE TABLE todos'))).toBe(false);
  });

  it('rebuilds reminder tables with contextual anchors and composite uniqueness', async () => {
    const harness = createDatabase({ initialVersion: 2 });
    await runMigrations(harness.database);

    const migrationSql = harness.executed.find((source) =>
      source.includes('CREATE TABLE reminder_rules_v3'),
    );
    expect(migrationSql).toContain("anchor TEXT NOT NULL CHECK (anchor IN ('start', 'due'))");
    expect(migrationSql).toContain('UNIQUE (todo_id, anchor, offset_minutes)');
    expect(migrationSql).toContain("WHEN todos.timing_kind = 'timed' AND todos.due_at IS NOT NULL");
    expect(migrationSql).toContain("THEN 'due'");
    expect(migrationSql).toContain("ELSE 'start'");
    expect(migrationSql).toContain('UNIQUE (anchor, offset_minutes)');
    expect(migrationSql).toContain("SELECT id, 'due', offset_minutes, sort_order");
    expect(harness.getVersion()).toBe(4);
  });

  it('creates and deterministically seeds todo templates in v4', async () => {
    const harness = createDatabase({ initialVersion: 3 });
    await runMigrations(harness.database);

    expect(harness.getVersion()).toBe(4);
    const schema = harness.executed.find((source) =>
      source.includes('CREATE TABLE todo_templates'),
    );
    expect(schema).toContain(
      'duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440)',
    );
    expect(schema).toContain('UNIQUE (template_id, anchor, offset_minutes)');
    expect(
      harness.executed.some((source) => source.includes('CREATE TABLE reminder_rules_v3')),
    ).toBe(false);
    expect(harness.database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO todo_templates'),
      ['00000000-0000-4000-8001-000000000001', '会议', 30, 0],
    );
    expect(harness.database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO todo_templates'),
      ['00000000-0000-4000-8001-000000000002', '作业截止', 1_440, 1],
    );
    expect(harness.database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO todo_template_reminder_rules'),
      [
        '00000000-0000-4000-8001-000000000101',
        '00000000-0000-4000-8001-000000000001',
        'start',
        10,
        0,
      ],
    );
  });

  it('does not advance the version when a migration fails', async () => {
    const harness = createDatabase({ failInsert: true });
    await expect(runMigrations(harness.database)).rejects.toThrow('injected migration failure');
    expect(harness.getVersion()).toBe(0);
  });

  it('keeps version 1 when the theme migration fails', async () => {
    const harness = createDatabase({ initialVersion: 1, failTheme: true });
    await expect(runMigrations(harness.database)).rejects.toThrow(
      'injected theme migration failure',
    );
    expect(harness.getVersion()).toBe(1);
  });
});
