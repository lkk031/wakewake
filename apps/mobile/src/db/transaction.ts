import type { SQLiteBindParams, SQLiteRunResult } from 'expo-sqlite';
import { Platform } from 'react-native';

export interface DatabaseExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SQLiteBindParams): Promise<SQLiteRunResult>;
  getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params: SQLiteBindParams): Promise<T[]>;
}

export interface TransactionDatabase extends DatabaseExecutor {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  withExclusiveTransactionAsync?(task: (txn: DatabaseExecutor) => Promise<void>): Promise<void>;
}

export async function withTransaction<T>(
  database: TransactionDatabase,
  task: (transaction: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  let result: T | undefined;

  if (Platform.OS !== 'web' && database.withExclusiveTransactionAsync) {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      result = await task(transaction);
    });
  } else {
    await database.withTransactionAsync(async () => {
      result = await task(database);
    });
  }

  return result as T;
}
