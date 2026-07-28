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

  it('upgrades a version 1 database with the theme setting', async () => {
    const harness = createDatabase({ initialVersion: 1 });
    await runMigrations(harness.database);

    expect(harness.getVersion()).toBe(2);
    expect(harness.executed.some((source) => source.includes('ADD COLUMN theme_mode'))).toBe(true);
    expect(harness.executed.some((source) => source.includes('CREATE TABLE todos'))).toBe(false);
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
