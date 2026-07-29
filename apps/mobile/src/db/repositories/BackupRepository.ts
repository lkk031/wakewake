import { BACKUP_FORMAT, BACKUP_VERSION, BackupV3Schema, type BackupV3 } from '@wakewake/domain';

import { validateBackupIntegrity } from '@/services/backup/backupFormat';
import type { DatabaseExecutor, TransactionDatabase } from '../transaction';
import { withTransaction } from '../transaction';
import { todoToPersistence } from '../rowMappers';
import { SettingsRepository } from './SettingsRepository';
import { TodoRepository } from './TodoRepository';
import { TodoTemplateRepository } from './TodoTemplateRepository';

export class BackupRepository {
  public constructor(private readonly database: TransactionDatabase) {}

  public async createBackup(exportedAt = new Date()): Promise<BackupV3> {
    return withTransaction(this.database, async (transaction) => {
      const transactionDatabase = transaction as TransactionDatabase;
      const todoRepository = new TodoRepository(transactionDatabase);
      const settingsRepository = new SettingsRepository(transactionDatabase);
      const templateRepository = new TodoTemplateRepository(transactionDatabase);
      const todos = await todoRepository.listAll();
      const occurrenceStates = await todoRepository.listOccurrenceStates();
      const settings = await settingsRepository.getSettings();
      const defaultReminders = await settingsRepository.getDefaultReminders();
      const templates = await templateRepository.list();
      const todoIds = new Set(todos.map((todo) => todo.id));
      return BackupV3Schema.parse({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt,
        todos,
        occurrenceStates: occurrenceStates.filter((state) => todoIds.has(state.todoId)),
        settings,
        defaultReminders,
        templates,
      });
    });
  }

  public async replaceAll(backupValue: BackupV3, importedAt = new Date()): Promise<void> {
    const backup = validateBackupIntegrity(backupValue);
    const timestamp = importedAt.toISOString();
    await withTransaction(this.database, async (transaction) => {
      await transaction.runAsync('DELETE FROM scheduled_notifications', []);
      await transaction.runAsync('DELETE FROM reminder_rules', []);
      await transaction.runAsync('DELETE FROM todo_occurrence_states', []);
      await transaction.runAsync('DELETE FROM todos', []);
      await transaction.runAsync('DELETE FROM default_reminder_rules', []);
      await transaction.runAsync('DELETE FROM todo_template_reminder_rules', []);
      await transaction.runAsync('DELETE FROM todo_templates', []);

      for (const todo of backup.todos) {
        await insertTodo(transaction, todoToPersistence(todo), timestamp);
        for (const [sortOrder, reminder] of todo.reminders.entries()) {
          await transaction.runAsync(
            `INSERT INTO reminder_rules (id, todo_id, anchor, offset_minutes, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
            [reminder.id, todo.id, reminder.anchor, reminder.offsetMinutes, sortOrder],
          );
        }
      }
      for (const state of backup.occurrenceStates) {
        await transaction.runAsync(
          `INSERT INTO todo_occurrence_states (
            todo_id, occurrence_key, status, completed_at, version, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            state.todoId,
            state.occurrenceKey,
            state.status,
            state.completedAt?.toISOString() ?? null,
            state.version,
            timestamp,
          ],
        );
      }
      for (const [sortOrder, reminder] of backup.defaultReminders.entries()) {
        await transaction.runAsync(
          `INSERT INTO default_reminder_rules (id, anchor, offset_minutes, sort_order)
           VALUES (?, ?, ?, ?)`,
          [reminder.id, reminder.anchor, reminder.offsetMinutes, sortOrder],
        );
      }
      for (const [sortOrder, template] of backup.templates.entries()) {
        await transaction.runAsync(
          `INSERT INTO todo_templates (id, name, duration_minutes, sort_order)
           VALUES (?, ?, ?, ?)`,
          [template.id, template.name, template.durationMinutes, sortOrder],
        );
        for (const [reminderSortOrder, reminder] of template.reminders.entries()) {
          await transaction.runAsync(
            `INSERT INTO todo_template_reminder_rules (
              id, template_id, anchor, offset_minutes, sort_order
             ) VALUES (?, ?, ?, ?, ?)`,
            [reminder.id, template.id, reminder.anchor, reminder.offsetMinutes, reminderSortOrder],
          );
        }
      }
      const result = await transaction.runAsync(
        `UPDATE app_settings SET
          theme_mode = ?, timezone_mode = ?, timezone = ?, locale = ?, week_starts_on = ?,
          default_duration_minutes = ?, updated_at = ?
         WHERE id = ?`,
        [
          backup.settings.themeMode,
          backup.settings.timezoneMode,
          backup.settings.timezone,
          backup.settings.locale,
          backup.settings.weekStartsOn,
          backup.settings.defaultDurationMinutes,
          timestamp,
          1,
        ],
      );
      if (result.changes !== 1) throw new Error('Application settings are not initialized');

      const foreignKeyErrors = await transaction.getAllAsync<Record<string, unknown>>(
        'PRAGMA foreign_key_check',
        [],
      );
      if (foreignKeyErrors.length > 0)
        throw new Error('Imported backup violates database references');
    });
  }
}

async function insertTodo(
  transaction: DatabaseExecutor,
  values: ReturnType<typeof todoToPersistence>,
  timestamp: string,
): Promise<void> {
  await transaction.runAsync(
    `INSERT INTO todos (
      id, title, notes, category_id, priority, status, timing_kind,
      start_at, due_at, all_day_start_date, all_day_end_date_exclusive,
      timezone, recurrence_json, completed_at, version, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      values.id,
      values.title,
      values.notes,
      values.categoryId,
      values.priority,
      values.status,
      values.timingKind,
      values.startAt,
      values.dueAt,
      values.allDayStartDate,
      values.allDayEndDateExclusive,
      values.timezone,
      values.recurrenceJson,
      values.completedAt,
      values.version,
      timestamp,
      timestamp,
    ],
  );
}
