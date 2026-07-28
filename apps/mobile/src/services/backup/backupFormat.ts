import { BackupSchema, type BackupV1 } from '@wakewake/domain';

export function validateBackupIntegrity(value: BackupV1): BackupV1 {
  const backup = BackupSchema.parse(value);
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
    if (todo.categoryId !== null) throw new Error('V1 backups cannot contain categories');
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
  return backup;
}

export function parseBackup(text: string): BackupV1 {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('Backup file is not valid JSON', { cause: error });
  }
  return validateBackupIntegrity(BackupSchema.parse(json));
}

export function serializeBackup(backup: BackupV1): string {
  return JSON.stringify(validateBackupIntegrity(BackupSchema.parse(backup)), null, 2);
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Backup contains duplicate ${label}`);
}
