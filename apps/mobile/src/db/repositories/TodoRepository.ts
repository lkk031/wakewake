import {
  OccurrenceStateSchema,
  TodoSchema,
  type OccurrenceState,
  type Todo,
} from '@wakewake/domain';

import type { DatabaseExecutor, TransactionDatabase } from '../transaction';
import { withTransaction } from '../transaction';
import {
  mapOccurrenceStateRow,
  mapTodoRow,
  todoToPersistence,
  type OccurrenceStateRow,
  type ReminderRuleRow,
  type TodoRow,
} from '../rowMappers';

export interface TodoRange {
  start: Date;
  end: Date;
  startDate: string;
  endDateExclusive: string;
}

const TODO_COLUMNS = `
  id, title, notes, category_id, priority, status, timing_kind,
  start_at, due_at, all_day_start_date, all_day_end_date_exclusive,
  timezone, recurrence_json, completed_at, version, created_at, updated_at, deleted_at
`;

function assertRecurringAnchorUnchanged(existing: Todo, next: Todo): void {
  if (existing.recurrence === null) return;
  const sameRule = JSON.stringify(existing.recurrence) === JSON.stringify(next.recurrence);
  const sameTiming = JSON.stringify(existing.timing) === JSON.stringify(next.timing);
  if (!sameRule || !sameTiming) {
    throw new Error('重复系列的频率和时间锚点不能修改；请删除后重新创建');
  }
}

function assertValidRange(range: TodoRange): void {
  if (range.end <= range.start) throw new Error('Range end must be after range start');
  if (range.endDateExclusive <= range.startDate) {
    throw new Error('Range endDateExclusive must be after startDate');
  }
}

export class TodoRepository {
  public constructor(private readonly database: TransactionDatabase) {}

  public async create(todoValue: Todo, now = new Date()): Promise<Todo> {
    const todo = TodoSchema.parse(todoValue);
    const values = todoToPersistence(todo);
    const timestamp = now.toISOString();

    await withTransaction(this.database, async (transaction) => {
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
      await this.replaceReminders(transaction, todo);
    });

    return todo;
  }

  public async update(todoValue: Todo, now = new Date()): Promise<Todo> {
    const todo = TodoSchema.parse(todoValue);
    const values = todoToPersistence(todo);
    const existing = await this.getById(todo.id);
    if (existing === null) throw new Error(`Active todo not found: ${todo.id}`);
    assertRecurringAnchorUnchanged(existing, todo);

    await withTransaction(this.database, async (transaction) => {
      const result = await transaction.runAsync(
        `UPDATE todos SET
          title = ?, notes = ?, category_id = ?, priority = ?, status = ?, timing_kind = ?,
          start_at = ?, due_at = ?, all_day_start_date = ?, all_day_end_date_exclusive = ?,
          timezone = ?, recurrence_json = ?, completed_at = ?, version = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
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
          now.toISOString(),
          values.id,
        ],
      );
      if (result.changes !== 1) throw new Error(`Active todo not found: ${todo.id}`);
      await this.replaceReminders(transaction, todo);
    });

    return todo;
  }

  public async getById(id: string): Promise<Todo | null> {
    const row = await this.database.getFirstAsync<TodoRow>(
      `SELECT ${TODO_COLUMNS} FROM todos WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (row === null) return null;
    return mapTodoRow(row, await this.getReminderRows([row.id]));
  }

  public async listAll(): Promise<Todo[]> {
    return this.hydrateRows(
      await this.database.getAllAsync<TodoRow>(
        `SELECT ${TODO_COLUMNS} FROM todos
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC, id`,
        [],
      ),
    );
  }

  public async listInbox(): Promise<Todo[]> {
    return this.hydrateRows(
      await this.database.getAllAsync<TodoRow>(
        `SELECT ${TODO_COLUMNS} FROM todos
         WHERE deleted_at IS NULL AND timing_kind = ?
         ORDER BY status ASC, updated_at DESC, id`,
        ['unscheduled'],
      ),
    );
  }

  public async listRangeCandidates(range: TodoRange): Promise<Todo[]> {
    assertValidRange(range);
    return this.hydrateRows(
      await this.database.getAllAsync<TodoRow>(
        `SELECT ${TODO_COLUMNS} FROM todos
         WHERE deleted_at IS NULL AND timing_kind <> 'unscheduled' AND (
           recurrence_json IS NOT NULL OR
           (timing_kind = 'timed' AND COALESCE(due_at, start_at) >= ? AND COALESCE(start_at, due_at) < ?) OR
           (timing_kind = 'allDay' AND all_day_end_date_exclusive > ? AND all_day_start_date < ?)
         )
         ORDER BY COALESCE(start_at, due_at, all_day_start_date), id`,
        [
          range.start.toISOString(),
          range.end.toISOString(),
          range.startDate,
          range.endDateExclusive,
        ],
      ),
    );
  }

  public async listAgendaCandidates(range: TodoRange, now = new Date()): Promise<Todo[]> {
    assertValidRange(range);
    return this.hydrateRows(
      await this.database.getAllAsync<TodoRow>(
        `SELECT ${TODO_COLUMNS} FROM todos
         WHERE deleted_at IS NULL AND timing_kind <> 'unscheduled' AND (
           recurrence_json IS NOT NULL OR
           (timing_kind = 'timed' AND COALESCE(due_at, start_at) >= ? AND COALESCE(start_at, due_at) < ?) OR
           (timing_kind = 'allDay' AND all_day_end_date_exclusive > ? AND all_day_start_date < ?) OR
           (recurrence_json IS NULL AND status = 'open' AND timing_kind = 'timed'
             AND due_at IS NOT NULL AND due_at < ?) OR
           (recurrence_json IS NULL AND status = 'open' AND timing_kind = 'allDay'
             AND all_day_end_date_exclusive <= ?)
         )
         ORDER BY COALESCE(start_at, due_at, all_day_start_date), id`,
        [
          range.start.toISOString(),
          range.end.toISOString(),
          range.startDate,
          range.endDateExclusive,
          now.toISOString(),
          range.startDate,
        ],
      ),
    );
  }

  public async setCompletion(
    todoId: string,
    completedAt: Date | null,
    occurrenceKey?: string,
  ): Promise<Todo | OccurrenceState> {
    if (occurrenceKey !== undefined) {
      const state = OccurrenceStateSchema.parse({
        todoId,
        occurrenceKey,
        status: completedAt === null ? 'open' : 'completed',
        completedAt,
      });
      const now = new Date().toISOString();
      await this.database.runAsync(
        `INSERT INTO todo_occurrence_states (
          todo_id, occurrence_key, status, completed_at, version, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(todo_id, occurrence_key) DO UPDATE SET
          status = excluded.status,
          completed_at = excluded.completed_at,
          version = todo_occurrence_states.version + 1,
          updated_at = excluded.updated_at`,
        [
          state.todoId,
          state.occurrenceKey,
          state.status,
          state.completedAt?.toISOString() ?? null,
          state.version,
          now,
        ],
      );
      const persisted = await this.getOccurrenceState(todoId, occurrenceKey);
      if (persisted === null) throw new Error('Failed to persist occurrence state');
      return persisted;
    }

    const current = await this.getById(todoId);
    if (current === null) throw new Error(`Active todo not found: ${todoId}`);
    const next = TodoSchema.parse({
      ...current,
      status: completedAt === null ? 'open' : 'completed',
      completedAt,
      version: current.version + 1,
    });
    return this.update(next);
  }

  public async listOccurrenceStates(todoIds?: string[]): Promise<OccurrenceState[]> {
    if (todoIds !== undefined && todoIds.length === 0) return [];

    const where =
      todoIds === undefined ? '' : ` WHERE todo_id IN (${todoIds.map(() => '?').join(', ')})`;
    const rows = await this.database.getAllAsync<OccurrenceStateRow>(
      `SELECT todo_id, occurrence_key, status, completed_at, version, updated_at
       FROM todo_occurrence_states${where}
       ORDER BY todo_id, occurrence_key`,
      todoIds ?? [],
    );
    return rows.map(mapOccurrenceStateRow);
  }

  public async getOccurrenceState(
    todoId: string,
    occurrenceKey: string,
  ): Promise<OccurrenceState | null> {
    const row = await this.database.getFirstAsync<OccurrenceStateRow>(
      `SELECT todo_id, occurrence_key, status, completed_at, version, updated_at
       FROM todo_occurrence_states WHERE todo_id = ? AND occurrence_key = ?`,
      [todoId, occurrenceKey],
    );
    return row === null ? null : mapOccurrenceStateRow(row);
  }

  public async softDelete(id: string, deletedAt = new Date()): Promise<boolean> {
    const timestamp = deletedAt.toISOString();
    const result = await this.database.runAsync(
      `UPDATE todos SET deleted_at = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND deleted_at IS NULL`,
      [timestamp, timestamp, id],
    );
    return result.changes === 1;
  }

  public async restoreDeleted(id: string, restoredAt = new Date()): Promise<boolean> {
    const result = await this.database.runAsync(
      `UPDATE todos SET deleted_at = NULL, updated_at = ?, version = version + 1
       WHERE id = ? AND deleted_at IS NOT NULL`,
      [restoredAt.toISOString(), id],
    );
    return result.changes === 1;
  }

  private async replaceReminders(transaction: DatabaseExecutor, todo: Todo): Promise<void> {
    await transaction.runAsync('DELETE FROM reminder_rules WHERE todo_id = ?', [todo.id]);
    for (const [sortOrder, reminder] of todo.reminders.entries()) {
      await transaction.runAsync(
        `INSERT INTO reminder_rules (id, todo_id, offset_minutes, sort_order)
         VALUES (?, ?, ?, ?)`,
        [reminder.id, todo.id, reminder.offsetMinutes, sortOrder],
      );
    }
  }

  private async getReminderRows(todoIds: string[]): Promise<ReminderRuleRow[]> {
    if (todoIds.length === 0) return [];
    const placeholders = todoIds.map(() => '?').join(', ');
    return this.database.getAllAsync<ReminderRuleRow>(
      `SELECT id, todo_id, offset_minutes, sort_order FROM reminder_rules
       WHERE todo_id IN (${placeholders}) ORDER BY todo_id, sort_order, id`,
      todoIds,
    );
  }

  private async hydrateRows(rows: TodoRow[]): Promise<Todo[]> {
    const reminders = await this.getReminderRows(rows.map((row) => row.id));
    const byTodo = new Map<string, ReminderRuleRow[]>();
    for (const reminder of reminders) {
      const todoId = reminder.todo_id;
      if (todoId === undefined) throw new Error('Reminder row is missing todo_id');
      const existing = byTodo.get(todoId) ?? [];
      existing.push(reminder);
      byTodo.set(todoId, existing);
    }
    return rows.map((row) => mapTodoRow(row, byTodo.get(row.id) ?? []));
  }
}
