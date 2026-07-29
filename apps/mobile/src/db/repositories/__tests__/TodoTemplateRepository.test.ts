import { createDefaultTodoTemplates, type TodoTemplate } from '@wakewake/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import type { DatabaseExecutor, TransactionDatabase } from '../../transaction';
import { TodoTemplateRepository } from '../TodoTemplateRepository';

function createDatabase(options: { templateRows?: unknown[]; reminderRows?: unknown[] } = {}) {
  const runAsync = vi.fn<DatabaseExecutor['runAsync']>(async () => ({
    changes: 1,
    lastInsertRowId: 1,
  }));
  const database: TransactionDatabase = {
    execAsync: vi.fn(async () => undefined),
    runAsync,
    getFirstAsync: vi.fn(async (source: string) =>
      source.includes('MAX(sort_order)') ? { next_sort_order: 2 } : null,
    ) as DatabaseExecutor['getFirstAsync'],
    getAllAsync: vi.fn(async (source: string) =>
      source.includes('todo_template_reminder_rules')
        ? (options.reminderRows ?? [])
        : (options.templateRows ?? []),
    ) as DatabaseExecutor['getAllAsync'],
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  };
  return { database, runAsync };
}

const meeting = createDefaultTodoTemplates()[0]!;
const homework = createDefaultTodoTemplates()[1]!;

function template(overrides: Partial<TodoTemplate> = {}): TodoTemplate {
  return {
    id: '6fca9198-7c59-4f03-84c0-d14b796bbdf1',
    name: '深度工作',
    durationMinutes: 60,
    reminders: [],
    ...overrides,
  };
}

describe('TodoTemplateRepository', () => {
  it('lists ordered templates with ordered dual-anchor reminders', async () => {
    const { database } = createDatabase({
      templateRows: [
        { id: meeting.id, name: meeting.name, duration_minutes: 30, sort_order: 0 },
        { id: homework.id, name: homework.name, duration_minutes: 1_440, sort_order: 1 },
      ],
      reminderRows: [
        {
          id: meeting.reminders[0]!.id,
          template_id: meeting.id,
          anchor: 'start',
          offset_minutes: 10,
          sort_order: 0,
        },
        ...homework.reminders.map((reminder, sort_order) => ({
          id: reminder.id,
          template_id: homework.id,
          anchor: reminder.anchor,
          offset_minutes: reminder.offsetMinutes,
          sort_order,
        })),
      ],
    });

    await expect(new TodoTemplateRepository(database).list()).resolves.toEqual([meeting, homework]);
    expect(database.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY sort_order, id'),
      [],
    );
  });

  it('creates at the end and persists reminder order atomically', async () => {
    const { database, runAsync } = createDatabase();
    const value = template({
      reminders: [
        {
          id: 'a469916e-4eaf-467c-b8c7-4123a594ce93',
          anchor: 'due',
          offsetMinutes: 15,
        },
      ],
    });
    await new TodoTemplateRepository(database).create(value);

    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO todo_templates'), [
      value.id,
      value.name,
      60,
      2,
    ]);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO todo_template_reminder_rules'),
      [value.reminders[0]!.id, value.id, 'due', 15, 0],
    );
    expect(database.withTransactionAsync).toHaveBeenCalledOnce();
  });

  it('updates a template and replaces reminders', async () => {
    const value = template();
    const { database, runAsync } = createDatabase({
      templateRows: [{ id: value.id, name: value.name, duration_minutes: 60, sort_order: 0 }],
    });
    await new TodoTemplateRepository(database).update(value);

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE todo_templates SET name = ?'),
      [value.name, value.durationMinutes, value.id],
    );
    expect(runAsync).toHaveBeenCalledWith(
      'DELETE FROM todo_template_reminder_rules WHERE template_id = ?',
      [value.id],
    );
  });

  it('rejects normalized duplicate names before writing', async () => {
    const { database, runAsync } = createDatabase({
      templateRows: [{ id: meeting.id, name: 'Meeting', duration_minutes: 30, sort_order: 0 }],
    });
    await expect(
      new TodoTemplateRepository(database).create(template({ name: '  meeting ' })),
    ).rejects.toThrow('name already exists');
    expect(runAsync).not.toHaveBeenCalled();
  });

  it('requires reorder IDs to exactly match persisted templates', async () => {
    const { database, runAsync } = createDatabase({
      templateRows: [
        { id: meeting.id, name: meeting.name, duration_minutes: 30, sort_order: 0 },
        { id: homework.id, name: homework.name, duration_minutes: 1_440, sort_order: 1 },
      ],
    });
    const repository = new TodoTemplateRepository(database);
    await expect(repository.reorder([meeting.id])).rejects.toThrow('match all persisted templates');
    await repository.reorder([homework.id, meeting.id]);
    expect(runAsync).toHaveBeenNthCalledWith(
      1,
      'UPDATE todo_templates SET sort_order = ? WHERE id = ?',
      [0, homework.id],
    );
    expect(runAsync).toHaveBeenNthCalledWith(
      2,
      'UPDATE todo_templates SET sort_order = ? WHERE id = ?',
      [1, meeting.id],
    );
  });

  it('replaces all templates in supplied order and hard deletes by ID', async () => {
    const { database, runAsync } = createDatabase();
    const repository = new TodoTemplateRepository(database);
    await repository.replaceAll([homework, meeting]);
    expect(runAsync).toHaveBeenNthCalledWith(1, 'DELETE FROM todo_templates', []);
    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO todo_templates'), [
      homework.id,
      homework.name,
      homework.durationMinutes,
      0,
    ]);
    await expect(repository.delete(meeting.id)).resolves.toBe(true);
  });
});
