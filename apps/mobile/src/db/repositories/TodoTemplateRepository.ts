import {
  MAX_TODO_TEMPLATES,
  TodoTemplateSchema,
  TodoTemplatesSchema,
  type TodoTemplate,
} from '@wakewake/domain';

import type { DatabaseExecutor, TransactionDatabase } from '../transaction';
import { withTransaction } from '../transaction';
import { mapTodoTemplateRow, type ReminderRuleRow, type TodoTemplateRow } from '../rowMappers';

const TEMPLATE_COLUMNS = 'id, name, duration_minutes, sort_order';

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export class TodoTemplateRepository {
  public constructor(private readonly database: TransactionDatabase) {}

  public async list(): Promise<TodoTemplate[]> {
    return this.listWith(this.database);
  }

  public async create(templateValue: TodoTemplate): Promise<void> {
    const template = TodoTemplateSchema.parse(templateValue);
    await withTransaction(this.database, async (transaction) => {
      const templates = await this.listWith(transaction);
      if (templates.length >= MAX_TODO_TEMPLATES) {
        throw new Error(`Todo template limit reached: ${MAX_TODO_TEMPLATES}`);
      }
      this.assertUniqueName(templates, template);
      const nextSortOrder =
        (
          await transaction.getFirstAsync<{ next_sort_order: number }>(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM todo_templates',
            [],
          )
        )?.next_sort_order ?? 0;
      await this.insertTemplate(transaction, template, nextSortOrder);
    });
  }

  public async update(templateValue: TodoTemplate): Promise<void> {
    const template = TodoTemplateSchema.parse(templateValue);
    await withTransaction(this.database, async (transaction) => {
      const templates = await this.listWith(transaction);
      if (!templates.some((existing) => existing.id === template.id)) {
        throw new Error(`Todo template not found: ${template.id}`);
      }
      this.assertUniqueName(templates, template);
      const result = await transaction.runAsync(
        `UPDATE todo_templates SET name = ?, duration_minutes = ? WHERE id = ?`,
        [template.name, template.durationMinutes, template.id],
      );
      if (result.changes !== 1) throw new Error(`Todo template not found: ${template.id}`);
      await this.replaceReminders(transaction, template);
    });
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.database.runAsync('DELETE FROM todo_templates WHERE id = ?', [id]);
    return result.changes === 1;
  }

  public async reorder(orderedIds: readonly string[]): Promise<void> {
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new Error('Todo template reorder IDs must be unique');
    }

    await withTransaction(this.database, async (transaction) => {
      const existingIds = (await this.listRows(transaction)).map((row) => row.id);
      if (
        existingIds.length !== orderedIds.length ||
        existingIds.some((id) => !orderedIds.includes(id))
      ) {
        throw new Error('Todo template reorder IDs must match all persisted templates');
      }
      for (const [sortOrder, id] of orderedIds.entries()) {
        const result = await transaction.runAsync(
          'UPDATE todo_templates SET sort_order = ? WHERE id = ?',
          [sortOrder, id],
        );
        if (result.changes !== 1) throw new Error(`Todo template not found: ${id}`);
      }
    });
  }

  public async replaceAll(templateValues: readonly TodoTemplate[]): Promise<void> {
    const templates = TodoTemplatesSchema.parse(templateValues);
    await withTransaction(this.database, async (transaction) => {
      await transaction.runAsync('DELETE FROM todo_templates', []);
      for (const [sortOrder, template] of templates.entries()) {
        await this.insertTemplate(transaction, template, sortOrder);
      }
    });
  }

  private assertUniqueName(templates: readonly TodoTemplate[], candidate: TodoTemplate): void {
    const candidateName = normalizeName(candidate.name);
    if (
      templates.some(
        (template) =>
          template.id !== candidate.id && normalizeName(template.name) === candidateName,
      )
    ) {
      throw new Error(`Todo template name already exists: ${candidate.name}`);
    }
  }

  private async listRows(database: DatabaseExecutor): Promise<TodoTemplateRow[]> {
    return database.getAllAsync<TodoTemplateRow>(
      `SELECT ${TEMPLATE_COLUMNS} FROM todo_templates ORDER BY sort_order, id`,
      [],
    );
  }

  private async listWith(database: DatabaseExecutor): Promise<TodoTemplate[]> {
    const rows = await this.listRows(database);
    if (rows.length === 0) return [];
    const reminders = await database.getAllAsync<ReminderRuleRow>(
      `SELECT id, template_id, anchor, offset_minutes, sort_order
       FROM todo_template_reminder_rules
       WHERE template_id IN (${rows.map(() => '?').join(', ')})
       ORDER BY template_id, sort_order, id`,
      rows.map((row) => row.id),
    );
    const remindersByTemplate = new Map<string, ReminderRuleRow[]>();
    for (const reminder of reminders) {
      const templateId = reminder.template_id;
      if (templateId === undefined) throw new Error('Template reminder row is missing template_id');
      const grouped = remindersByTemplate.get(templateId) ?? [];
      grouped.push(reminder);
      remindersByTemplate.set(templateId, grouped);
    }
    return TodoTemplatesSchema.parse(
      rows.map((row) => mapTodoTemplateRow(row, remindersByTemplate.get(row.id) ?? [])),
    );
  }

  private async insertTemplate(
    database: DatabaseExecutor,
    template: TodoTemplate,
    sortOrder: number,
  ): Promise<void> {
    await database.runAsync(
      `INSERT INTO todo_templates (id, name, duration_minutes, sort_order)
       VALUES (?, ?, ?, ?)`,
      [template.id, template.name, template.durationMinutes, sortOrder],
    );
    await this.insertReminders(database, template);
  }

  private async replaceReminders(
    database: DatabaseExecutor,
    template: TodoTemplate,
  ): Promise<void> {
    await database.runAsync('DELETE FROM todo_template_reminder_rules WHERE template_id = ?', [
      template.id,
    ]);
    await this.insertReminders(database, template);
  }

  private async insertReminders(database: DatabaseExecutor, template: TodoTemplate): Promise<void> {
    for (const [sortOrder, reminder] of template.reminders.entries()) {
      await database.runAsync(
        `INSERT INTO todo_template_reminder_rules (
          id, template_id, anchor, offset_minutes, sort_order
         ) VALUES (?, ?, ?, ?, ?)`,
        [reminder.id, template.id, reminder.anchor, reminder.offsetMinutes, sortOrder],
      );
    }
  }
}
