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

export const DEFAULT_TODO_TEMPLATE_IDS = {
  meeting: '00000000-0000-4000-8001-000000000001',
  homeworkDeadline: '00000000-0000-4000-8001-000000000002',
} as const;

const DEFAULT_TODO_TEMPLATE_REMINDER_IDS = {
  meetingStart10: '00000000-0000-4000-8001-000000000101',
  homeworkDue1440: '00000000-0000-4000-8001-000000000201',
  homeworkDue60: '00000000-0000-4000-8001-000000000202',
} as const;

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
  {
    version: 3,
    async up(database) {
      const reminderCountBefore = await getTableCount(database, 'reminder_rules');
      const defaultReminderCountBefore = await getTableCount(database, 'default_reminder_rules');

      await database.execAsync(`
        CREATE TABLE reminder_rules_v3 (
          id TEXT PRIMARY KEY NOT NULL,
          todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
          anchor TEXT NOT NULL CHECK (anchor IN ('start', 'due')),
          offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN 0 AND 525600),
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE (todo_id, anchor, offset_minutes)
        );

        INSERT INTO reminder_rules_v3 (id, todo_id, anchor, offset_minutes, sort_order)
        SELECT reminder_rules.id, reminder_rules.todo_id,
          CASE
            WHEN todos.timing_kind = 'timed' AND todos.due_at IS NOT NULL THEN 'due'
            ELSE 'start'
          END,
          reminder_rules.offset_minutes, reminder_rules.sort_order
        FROM reminder_rules
        INNER JOIN todos ON todos.id = reminder_rules.todo_id;

        DROP TABLE reminder_rules;
        ALTER TABLE reminder_rules_v3 RENAME TO reminder_rules;
        CREATE INDEX reminder_rules_todo_order
          ON reminder_rules(todo_id, sort_order, id);

        CREATE TABLE default_reminder_rules_v3 (
          id TEXT PRIMARY KEY NOT NULL,
          anchor TEXT NOT NULL CHECK (anchor IN ('start', 'due')),
          offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN 0 AND 525600),
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE (anchor, offset_minutes)
        );

        INSERT INTO default_reminder_rules_v3 (id, anchor, offset_minutes, sort_order)
        SELECT id, 'due', offset_minutes, sort_order
        FROM default_reminder_rules;

        DROP TABLE default_reminder_rules;
        ALTER TABLE default_reminder_rules_v3 RENAME TO default_reminder_rules;
      `);

      await assertTableCount(database, 'reminder_rules', reminderCountBefore);
      await assertTableCount(database, 'default_reminder_rules', defaultReminderCountBefore);

      const foreignKeyErrors = await database.getAllAsync<Record<string, unknown>>(
        'PRAGMA foreign_key_check',
        [],
      );
      if (foreignKeyErrors.length > 0) {
        throw new Error('Reminder anchor migration violates database references');
      }
    },
  },
  {
    version: 4,
    async up(database) {
      await database.execAsync(`
        CREATE TABLE todo_templates (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 80),
          duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
          sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
        );
        CREATE INDEX todo_templates_order ON todo_templates(sort_order, id);

        CREATE TABLE todo_template_reminder_rules (
          id TEXT PRIMARY KEY NOT NULL,
          template_id TEXT NOT NULL REFERENCES todo_templates(id) ON DELETE CASCADE,
          anchor TEXT NOT NULL CHECK (anchor IN ('start', 'due')),
          offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN 0 AND 525600),
          sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
          UNIQUE (template_id, anchor, offset_minutes)
        );
        CREATE INDEX todo_template_reminder_rules_order
          ON todo_template_reminder_rules(template_id, sort_order, id);
      `);

      await database.runAsync(
        `INSERT INTO todo_templates (id, name, duration_minutes, sort_order)
         VALUES (?, ?, ?, ?)`,
        [DEFAULT_TODO_TEMPLATE_IDS.meeting, '会议', 30, 0],
      );
      await database.runAsync(
        `INSERT INTO todo_templates (id, name, duration_minutes, sort_order)
         VALUES (?, ?, ?, ?)`,
        [DEFAULT_TODO_TEMPLATE_IDS.homeworkDeadline, '作业截止', 1_440, 1],
      );

      const reminders = [
        [
          DEFAULT_TODO_TEMPLATE_REMINDER_IDS.meetingStart10,
          DEFAULT_TODO_TEMPLATE_IDS.meeting,
          'start',
          10,
          0,
        ],
        [
          DEFAULT_TODO_TEMPLATE_REMINDER_IDS.homeworkDue1440,
          DEFAULT_TODO_TEMPLATE_IDS.homeworkDeadline,
          'due',
          1_440,
          0,
        ],
        [
          DEFAULT_TODO_TEMPLATE_REMINDER_IDS.homeworkDue60,
          DEFAULT_TODO_TEMPLATE_IDS.homeworkDeadline,
          'due',
          60,
          1,
        ],
      ] as const;
      for (const [id, templateId, anchor, offsetMinutes, sortOrder] of reminders) {
        await database.runAsync(
          `INSERT INTO todo_template_reminder_rules (
            id, template_id, anchor, offset_minutes, sort_order
           ) VALUES (?, ?, ?, ?, ?)`,
          [id, templateId, anchor, offsetMinutes, sortOrder],
        );
      }

      await assertTableCount(database, 'todo_templates', 2);
      await assertTableCount(database, 'todo_template_reminder_rules', 3);
      const foreignKeyErrors = await database.getAllAsync<Record<string, unknown>>(
        'PRAGMA foreign_key_check',
        [],
      );
      if (foreignKeyErrors.length > 0) {
        throw new Error('Todo template migration violates database references');
      }
    },
  },
];

export const LATEST_DATABASE_VERSION = migrations.at(-1)?.version ?? 0;

async function getTableCount(database: DatabaseExecutor, table: string): Promise<number | null> {
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${table}`,
    [],
  );
  return row?.count ?? null;
}

async function assertTableCount(
  database: DatabaseExecutor,
  table: string,
  expected: number | null,
): Promise<void> {
  if (expected === null) return;
  const actual = await getTableCount(database, table);
  if (actual !== expected) {
    throw new Error(`Reminder anchor migration changed ${table} row count`);
  }
}

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
