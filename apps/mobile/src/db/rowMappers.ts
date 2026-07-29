import {
  BackupSettingsSchema,
  OccurrenceStateSchema,
  ReminderRuleSchema,
  TodoSchema,
  TodoTemplateSchema,
  type BackupSettings,
  type OccurrenceState,
  type ReminderRule,
  type Todo,
  type TodoTemplate,
} from '@wakewake/domain';

export interface TodoRow {
  id: string;
  title: string;
  notes: string;
  category_id: string | null;
  priority: string;
  status: string;
  timing_kind: string;
  start_at: string | null;
  due_at: string | null;
  all_day_start_date: string | null;
  all_day_end_date_exclusive: string | null;
  timezone: string | null;
  recurrence_json: string | null;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ReminderRuleRow {
  id: string;
  todo_id?: string;
  template_id?: string;
  anchor: string;
  offset_minutes: number;
  sort_order: number;
}

export interface TodoTemplateRow {
  id: string;
  name: string;
  duration_minutes: number;
  sort_order: number;
}

export interface OccurrenceStateRow {
  todo_id: string;
  occurrence_key: string;
  status: string;
  completed_at: string | null;
  version: number;
  updated_at: string;
}

export interface SettingsRow {
  theme_mode: string;
  timezone_mode: string;
  timezone: string;
  locale: string;
  week_starts_on: number;
  default_duration_minutes: number;
}

export interface ScheduledNotificationRow {
  logical_key: string;
  native_notification_id: string;
  todo_id: string;
  occurrence_key: string | null;
  reminder_rule_id: string | null;
  scheduled_at: string;
  created_at: string;
}

export interface ScheduledNotification {
  logicalKey: string;
  nativeNotificationId: string;
  todoId: string;
  occurrenceKey: string | null;
  reminderRuleId: string | null;
  scheduledAt: Date;
  createdAt: Date;
}

export interface TodoPersistenceValues {
  id: string;
  title: string;
  notes: string;
  categoryId: string | null;
  priority: string;
  status: string;
  timingKind: string;
  startAt: string | null;
  dueAt: string | null;
  allDayStartDate: string | null;
  allDayEndDateExclusive: string | null;
  timezone: string | null;
  recurrenceJson: string | null;
  completedAt: string | null;
  version: number;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error('Persisted JSON is invalid', { cause: error });
  }
}

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Persisted ${field} is not a valid date`);
  return parsed;
}

export function mapReminderRuleRow(row: ReminderRuleRow): ReminderRule {
  return ReminderRuleSchema.parse({
    id: row.id,
    anchor: row.anchor,
    offsetMinutes: row.offset_minutes,
  });
}

export function mapTodoTemplateRow(
  row: TodoTemplateRow,
  reminderRows: ReminderRuleRow[],
): TodoTemplate {
  return TodoTemplateSchema.parse({
    id: row.id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    reminders: reminderRows.map(mapReminderRuleRow),
  });
}

export function mapTodoRow(row: TodoRow, reminderRows: ReminderRuleRow[]): Todo {
  const timing = (() => {
    switch (row.timing_kind) {
      case 'unscheduled':
        return { kind: 'unscheduled' as const };
      case 'timed':
        return {
          kind: 'timed' as const,
          startAt: row.start_at,
          dueAt: row.due_at,
          timezone: row.timezone,
        };
      case 'allDay':
        return {
          kind: 'allDay' as const,
          startDate: row.all_day_start_date,
          endDateExclusive: row.all_day_end_date_exclusive,
          timezone: row.timezone,
        };
      default:
        throw new Error(`Unsupported persisted timing kind: ${row.timing_kind}`);
    }
  })();

  return TodoSchema.parse({
    id: row.id,
    title: row.title,
    notes: row.notes,
    categoryId: row.category_id,
    priority: row.priority,
    status: row.status,
    timing,
    reminders: reminderRows.map(mapReminderRuleRow),
    recurrence: row.recurrence_json === null ? null : parseJson(row.recurrence_json),
    completedAt: row.completed_at,
    version: row.version,
  });
}

export function todoToPersistence(todoValue: Todo): TodoPersistenceValues {
  const todo = TodoSchema.parse(todoValue);
  const timingColumns = (() => {
    switch (todo.timing.kind) {
      case 'unscheduled':
        return {
          timingKind: todo.timing.kind,
          startAt: null,
          dueAt: null,
          allDayStartDate: null,
          allDayEndDateExclusive: null,
          timezone: null,
        };
      case 'timed':
        return {
          timingKind: todo.timing.kind,
          startAt: todo.timing.startAt?.toISOString() ?? null,
          dueAt: todo.timing.dueAt?.toISOString() ?? null,
          allDayStartDate: null,
          allDayEndDateExclusive: null,
          timezone: todo.timing.timezone,
        };
      case 'allDay':
        return {
          timingKind: todo.timing.kind,
          startAt: null,
          dueAt: null,
          allDayStartDate: todo.timing.startDate,
          allDayEndDateExclusive: todo.timing.endDateExclusive,
          timezone: todo.timing.timezone,
        };
    }
  })();

  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes,
    categoryId: todo.categoryId,
    priority: todo.priority,
    status: todo.status,
    ...timingColumns,
    recurrenceJson: todo.recurrence === null ? null : JSON.stringify(todo.recurrence),
    completedAt: todo.completedAt?.toISOString() ?? null,
    version: todo.version,
  };
}

export function mapOccurrenceStateRow(row: OccurrenceStateRow): OccurrenceState {
  return OccurrenceStateSchema.parse({
    todoId: row.todo_id,
    occurrenceKey: row.occurrence_key,
    status: row.status,
    completedAt: row.completed_at,
    version: row.version,
  });
}

export function mapSettingsRow(row: SettingsRow): BackupSettings {
  return BackupSettingsSchema.parse({
    themeMode: row.theme_mode,
    timezoneMode: row.timezone_mode,
    timezone: row.timezone,
    locale: row.locale,
    weekStartsOn: row.week_starts_on,
    defaultDurationMinutes: row.default_duration_minutes,
  });
}

export function mapScheduledNotificationRow(row: ScheduledNotificationRow): ScheduledNotification {
  return {
    logicalKey: row.logical_key,
    nativeNotificationId: row.native_notification_id,
    todoId: row.todo_id,
    occurrenceKey: row.occurrence_key,
    reminderRuleId: row.reminder_rule_id,
    scheduledAt: parseDate(row.scheduled_at, 'scheduled_at'),
    createdAt: parseDate(row.created_at, 'created_at'),
  };
}
