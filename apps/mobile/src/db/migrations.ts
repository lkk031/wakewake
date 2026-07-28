import type { DatabaseExecutor, TransactionDatabase } from './transaction';
import { withTransaction } from './transaction';

interface Migration {
  version: number;
  up(database: DatabaseExecutor): Promise<void>;
}

const INITIAL_SCHEMA_SQL = `
  CREATE TABLE todos (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    category_id TEXT,
    priority TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('none', 'low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
    timing_kind TEXT NOT NULL CHECK (timing_kind IN ('unscheduled', 'timed', 'allDay')),
    start_at TEXT,
    due_at TEXT,
    all_day_start_date TEXT,
    all_day_end_date_exclusive TEXT,
    timezone TEXT,
    recurrence_json TEXT,
    completed_at TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (
      (timing_kind = 'unscheduled' AND start_at IS NULL AND due_at IS NULL AND all_day_start_date IS NULL AND all_day_end_date_exclusive IS NULL AND timezone IS NULL) OR
      (timing_kind = 'timed' AND (start_at IS NOT NULL OR due_at IS NOT NULL) AND all_day_start_date IS NULL AND all_day_end_date_exclusive IS NULL AND timezone IS NOT NULL) OR
      (timing_kind = 'allDay' AND start_at IS NULL AND due_at IS NULL AND all_day_start_date IS NOT NULL AND all_day_end_date_exclusive IS NOT NULL AND timezone IS NOT NULL)
    ),
    CHECK (start_at IS NULL OR due_at IS NULL OR due_at >= start_at),
    CHECK ((status = 'open' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL))
  );

  CREATE INDEX todos_active_updated ON todos(updated_at, id) WHERE deleted_at IS NULL;
  CREATE INDEX todos_active_timed_range ON todos(due_at, start_at) WHERE deleted_at IS NULL AND timing_kind = 'timed';
  CREATE INDEX todos_active_all_day_range ON todos(all_day_start_date, all_day_end_date_exclusive) WHERE deleted_at IS NULL AND timing_kind = 'allDay';

  CREATE TABLE reminder_rules (
    id TEXT PRIMARY KEY NOT NULL,
    todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN 0 AND 525600),
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (todo_id, offset_minutes)
  );
  CREATE INDEX reminder_rules_todo_order ON reminder_rules(todo_id, sort_order, id);

  CREATE TABLE todo_occurrence_states (
    todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    occurrence_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
    completed_at TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (todo_id, occurrence_key),
    CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status IN ('open', 'cancelled') AND completed_at IS NULL))
  );

  CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    timezone_mode TEXT NOT NULL DEFAULT 'system' CHECK (timezone_mode IN ('system', 'fixed')),
    timezone TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'zh-CN',
    week_starts_on INTEGER NOT NULL DEFAULT 1 CHECK (week_starts_on IN (0, 1)),
    default_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (default_duration_minutes BETWEEN 1 AND 1440),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE default_reminder_rules (
    id TEXT PRIMARY KEY NOT NULL,
    offset_minutes INTEGER NOT NULL UNIQUE CHECK (offset_minutes BETWEEN 0 AND 525600),
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE scheduled_notifications (
    logical_key TEXT PRIMARY KEY NOT NULL,
    native_notification_id TEXT NOT NULL UNIQUE,
    todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    occurrence_key TEXT,
    reminder_rule_id TEXT,
    scheduled_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX scheduled_notifications_todo ON scheduled_notifications(todo_id);
  CREATE INDEX scheduled_notifications_scheduled_at ON scheduled_notifications(scheduled_at);
`;

export const migrations: readonly Migration[] = [
  {
    version: 1,
    async up(database) {
      await database.execAsync(INITIAL_SCHEMA_SQL);
      await database.runAsync(
        `INSERT INTO app_settings (
          id, timezone_mode, timezone, locale, week_starts_on, default_duration_minutes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [1, 'system', 'Asia/Shanghai', 'zh-CN', 1, 30, new Date().toISOString()],
      );

      const defaults = [
        ['00000000-0000-4000-8000-000000001440', 1_440, 0],
        ['00000000-0000-4000-8000-000000000060', 60, 1],
        ['00000000-0000-4000-8000-000000000010', 10, 2],
      ] as const;
      for (const [id, offsetMinutes, sortOrder] of defaults) {
        await database.runAsync(
          `INSERT INTO default_reminder_rules (id, offset_minutes, sort_order)
           VALUES (?, ?, ?)`,
          [id, offsetMinutes, sortOrder],
        );
      }
    },
  },
  {
    version: 2,
    async up(database) {
      await database.execAsync(`
        ALTER TABLE app_settings
        ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system'
        CHECK (theme_mode IN ('system', 'light', 'dark'));
      `);
    },
  },
];

export const LATEST_DATABASE_VERSION = migrations.at(-1)?.version ?? 0;

export async function getUserVersion(database: DatabaseExecutor): Promise<number> {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  return row?.user_version ?? 0;
}

export async function runMigrations(database: TransactionDatabase): Promise<void> {
  const currentVersion = await getUserVersion(database);
  if (currentVersion > LATEST_DATABASE_VERSION) {
    throw new Error(
      `Database version ${currentVersion} is newer than supported version ${LATEST_DATABASE_VERSION}`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    await withTransaction(database, async (transaction) => {
      await migration.up(transaction);
      // The version is an application-owned integer from the static migration list.
      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
