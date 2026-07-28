import type { DatabaseExecutor } from '../transaction';
import {
  mapScheduledNotificationRow,
  type ScheduledNotification,
  type ScheduledNotificationRow,
} from '../rowMappers';

export type NewScheduledNotification = Omit<ScheduledNotification, 'createdAt'> & {
  createdAt?: Date;
};

function validateNotification(value: NewScheduledNotification): NewScheduledNotification {
  if (
    value.logicalKey.length === 0 ||
    value.nativeNotificationId.length === 0 ||
    value.todoId.length === 0
  ) {
    throw new Error('Notification logical key, native ID, and todo ID are required');
  }
  if (Number.isNaN(value.scheduledAt.getTime())) {
    throw new Error('Notification scheduledAt must be a valid date');
  }
  if (value.createdAt !== undefined && Number.isNaN(value.createdAt.getTime())) {
    throw new Error('Notification createdAt must be a valid date');
  }
  return value;
}

export class NotificationRepository {
  public constructor(private readonly database: DatabaseExecutor) {}

  public async upsert(value: NewScheduledNotification): Promise<ScheduledNotification> {
    const notification = validateNotification(value);
    const createdAt = notification.createdAt ?? new Date();
    await this.database.runAsync(
      `INSERT INTO scheduled_notifications (
        logical_key, native_notification_id, todo_id, occurrence_key,
        reminder_rule_id, scheduled_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(logical_key) DO UPDATE SET
        native_notification_id = excluded.native_notification_id,
        todo_id = excluded.todo_id,
        occurrence_key = excluded.occurrence_key,
        reminder_rule_id = excluded.reminder_rule_id,
        scheduled_at = excluded.scheduled_at`,
      [
        notification.logicalKey,
        notification.nativeNotificationId,
        notification.todoId,
        notification.occurrenceKey,
        notification.reminderRuleId,
        notification.scheduledAt.toISOString(),
        createdAt.toISOString(),
      ],
    );
    const persisted = await this.getByLogicalKey(notification.logicalKey);
    if (persisted === null) throw new Error('Failed to persist scheduled notification');
    return persisted;
  }

  public async getByLogicalKey(logicalKey: string): Promise<ScheduledNotification | null> {
    const row = await this.database.getFirstAsync<ScheduledNotificationRow>(
      `SELECT logical_key, native_notification_id, todo_id, occurrence_key,
              reminder_rule_id, scheduled_at, created_at
       FROM scheduled_notifications WHERE logical_key = ?`,
      [logicalKey],
    );
    return row === null ? null : mapScheduledNotificationRow(row);
  }

  public async listAll(): Promise<ScheduledNotification[]> {
    const rows = await this.database.getAllAsync<ScheduledNotificationRow>(
      `SELECT logical_key, native_notification_id, todo_id, occurrence_key,
              reminder_rule_id, scheduled_at, created_at
       FROM scheduled_notifications ORDER BY scheduled_at, logical_key`,
      [],
    );
    return rows.map(mapScheduledNotificationRow);
  }

  public async listByTodoId(todoId: string): Promise<ScheduledNotification[]> {
    const rows = await this.database.getAllAsync<ScheduledNotificationRow>(
      `SELECT logical_key, native_notification_id, todo_id, occurrence_key,
              reminder_rule_id, scheduled_at, created_at
       FROM scheduled_notifications WHERE todo_id = ? ORDER BY scheduled_at, logical_key`,
      [todoId],
    );
    return rows.map(mapScheduledNotificationRow);
  }

  public async remove(logicalKey: string): Promise<boolean> {
    const result = await this.database.runAsync(
      'DELETE FROM scheduled_notifications WHERE logical_key = ?',
      [logicalKey],
    );
    return result.changes === 1;
  }

  public async removeByTodoId(todoId: string): Promise<number> {
    const result = await this.database.runAsync(
      'DELETE FROM scheduled_notifications WHERE todo_id = ?',
      [todoId],
    );
    return result.changes;
  }

  public async clear(): Promise<number> {
    const result = await this.database.runAsync('DELETE FROM scheduled_notifications', []);
    return result.changes;
  }
}
