import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupSchema,
  BackupV3Schema,
  createDefaultTodoTemplates,
  type Backup,
  type BackupV3,
  type ReminderAnchor,
  type TodoTiming,
} from '@wakewake/domain';

export function validateBackupIntegrity(value: BackupV3): BackupV3 {
  const backup = BackupV3Schema.parse(value);
  assertUnique(
    backup.todos.map((todo) => todo.id),
    'todo IDs',
  );
  assertUnique(
    backup.occurrenceStates.map((state) => `${state.todoId}\0${state.occurrenceKey}`),
    'occurrence states',
  );
  const todoIds = new Set(backup.todos.map((todo) => todo.id));
  for (const todo of backup.todos) {
    if (todo.categoryId !== null) throw new Error('WakeWake backups cannot contain categories');
    assertUnique(
      todo.reminders.map((rule) => rule.id),
      `reminder IDs for todo ${todo.id}`,
    );
  }
  for (const state of backup.occurrenceStates) {
    if (!todoIds.has(state.todoId))
      throw new Error(`Occurrence state references missing todo: ${state.todoId}`);
  }
  assertUnique(
    backup.defaultReminders.map((rule) => rule.id),
    'default reminder IDs',
  );
  assertUnique(
    backup.templates.map((template) => template.id),
    'template IDs',
  );
  assertUnique(
    backup.templates.flatMap((template) => template.reminders.map((rule) => rule.id)),
    'template reminder IDs',
  );
  return backup;
}

export function parseBackup(text: string): BackupV3 {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('Backup file is not valid JSON', { cause: error });
  }
  return validateBackupIntegrity(normalizeBackup(BackupSchema.parse(json)));
}

export function serializeBackup(backup: BackupV3): string {
  return JSON.stringify(validateBackupIntegrity(BackupV3Schema.parse(backup)), null, 2);
}

function normalizeBackup(backup: Backup): BackupV3 {
  if (backup.version === BACKUP_VERSION) return backup;

  const legacy = backup.version === 1;
  return BackupV3Schema.parse({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: backup.exportedAt,
    todos: legacy
      ? backup.todos.map((todo) => {
          const anchor = legacyReminderAnchor(todo.timing);
          return {
            ...todo,
            reminders: todo.reminders.map((rule) => ({ ...rule, anchor })),
          };
        })
      : backup.todos,
    occurrenceStates: backup.occurrenceStates,
    settings: backup.settings,
    defaultReminders: legacy
      ? backup.defaultReminders.map((rule) => ({ ...rule, anchor: 'due' as const }))
      : backup.defaultReminders,
    templates: createDefaultTodoTemplates(),
  });
}

function legacyReminderAnchor(timing: TodoTiming): ReminderAnchor {
  if (timing.kind === 'allDay') return 'start';
  if (timing.kind === 'timed' && timing.dueAt === null) return 'start';
  return 'due';
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Backup contains duplicate ${label}`);
}
