import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { runMigrations } from './migrations';

export const DATABASE_NAME = 'wakewake.db';
export const DATABASE_BUSY_TIMEOUT_MS = 5_000;

export async function configureDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS};
  `);
  await runMigrations(database);
}

export async function initializeDatabase(databaseName = DATABASE_NAME): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(databaseName);
  await configureDatabase(database);
  return database;
}
