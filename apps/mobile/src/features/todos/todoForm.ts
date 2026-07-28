import {
  addCalendarDays,
  getWallClockDateTime,
  localDateAt,
  TodoSchema,
  wallClockToInstant,
  type Priority,
  type RecurrenceRule,
  type ReminderRule,
  type Todo,
  type WallClockDateTime,
} from '@wakewake/domain';

export type TodoFormTimingKind = 'unscheduled' | 'timed' | 'allDay';

export interface TodoFormValues {
  title: string;
  notes: string;
  priority: Priority;
  timingKind: TodoFormTimingKind;
  date: string;
  startTime: string;
  dueDate: string;
  dueTime: string;
  allDayEndDate: string;
  reminders: ReminderRule[];
  recurrence: RecurrenceRule | null;
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (match === null || hour > 23 || minute > 59) {
    throw new RangeError(`Invalid time: ${value}`);
  }
  return { hour, minute };
}

function wallClock(date: string, time: string, timezone: string): Date {
  const dateParts = getWallClockDateTime(new Date(`${date}T12:00:00.000Z`), 'UTC');
  const clock = parseTime(time);
  const parts: WallClockDateTime = {
    year: dateParts.year,
    month: dateParts.month,
    day: dateParts.day,
    hour: clock.hour,
    minute: clock.minute,
    second: 0,
    millisecond: 0,
  };
  return wallClockToInstant(parts, timezone);
}

interface TodoFormDefaultOptions {
  now?: Date | undefined;
  dateAnchor?: string | undefined;
}

export function createTodoFormDefaults(
  timezone: string,
  defaultDurationMinutes: number,
  reminderTemplates: readonly Pick<ReminderRule, 'offsetMinutes'>[],
  createReminderId: () => string,
  options: TodoFormDefaultOptions = {},
): TodoFormValues {
  const now = options.now ?? new Date();
  const current = getWallClockDateTime(now, timezone);
  const nextHalfHour = Math.ceil((current.minute + 1) / 30) * 30;
  const startHour = current.hour + Math.floor(nextHalfHour / 60);
  const startMinute = nextHalfHour % 60;
  const currentDate = localDateAt(now, timezone);
  const defaultStartDate = startHour >= 24 ? addCalendarDays(currentDate, 1) : currentDate;
  const startDate = options.dateAnchor ?? defaultStartDate;
  const startInstant = wallClock(
    startDate,
    `${String(startHour % 24).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
    timezone,
  );
  const dueInstant = new Date(startInstant.getTime() + defaultDurationMinutes * 60_000);
  const start = getWallClockDateTime(startInstant, timezone);
  const due = getWallClockDateTime(dueInstant, timezone);
  return {
    title: '',
    notes: '',
    priority: 'none',
    timingKind: 'timed',
    date: localDateAt(startInstant, timezone),
    startTime: `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`,
    dueDate: localDateAt(dueInstant, timezone),
    dueTime: `${String(due.hour).padStart(2, '0')}:${String(due.minute).padStart(2, '0')}`,
    allDayEndDate: addCalendarDays(localDateAt(startInstant, timezone), 1),
    reminders: reminderTemplates.map((template) => ({
      id: createReminderId(),
      offsetMinutes: template.offsetMinutes,
    })),
    recurrence: null,
  };
}

export function todoToFormValues(todo: Todo, timezone: string): TodoFormValues {
  if (todo.timing.kind === 'unscheduled') {
    return {
      title: todo.title,
      notes: todo.notes,
      priority: todo.priority,
      timingKind: 'unscheduled',
      date: localDateAt(new Date(), timezone),
      startTime: '09:00',
      dueDate: localDateAt(new Date(), timezone),
      dueTime: '09:30',
      allDayEndDate: addCalendarDays(localDateAt(new Date(), timezone), 1),
      reminders: [],
      recurrence: null,
    };
  }
  if (todo.timing.kind === 'allDay') {
    return {
      title: todo.title,
      notes: todo.notes,
      priority: todo.priority,
      timingKind: 'allDay',
      date: todo.timing.startDate,
      startTime: '09:00',
      dueDate: todo.timing.startDate,
      dueTime: '09:30',
      allDayEndDate: todo.timing.endDateExclusive,
      reminders: todo.reminders,
      recurrence: todo.recurrence,
    };
  }
  const base = todo.timing.startAt ?? todo.timing.dueAt;
  const due = todo.timing.dueAt ?? todo.timing.startAt;
  if (base === null || due === null) throw new Error('Timed todo is missing its time');
  const startWall = getWallClockDateTime(base, todo.timing.timezone);
  const dueWall = getWallClockDateTime(due, todo.timing.timezone);
  return {
    title: todo.title,
    notes: todo.notes,
    priority: todo.priority,
    timingKind: 'timed',
    date: localDateAt(base, todo.timing.timezone),
    startTime: `${String(startWall.hour).padStart(2, '0')}:${String(startWall.minute).padStart(2, '0')}`,
    dueDate: localDateAt(due, todo.timing.timezone),
    dueTime: `${String(dueWall.hour).padStart(2, '0')}:${String(dueWall.minute).padStart(2, '0')}`,
    allDayEndDate: addCalendarDays(localDateAt(base, todo.timing.timezone), 1),
    reminders: todo.reminders,
    recurrence: todo.recurrence,
  };
}

export function todoSubmitErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '保存失败，请重试';

  const message = error.message;
  if (/UNIQUE constraint failed:\s*reminder_rules\.id/i.test(message)) {
    return '提醒数据发生冲突，保存失败，请重试';
  }
  if (/\b(SQLite|constraint failed|NativeStatement)\b/i.test(message)) {
    return '保存失败，请重试';
  }
  return message;
}

export function mapTodoForm(
  values: TodoFormValues,
  timezone: string,
  id: string,
  existing?: Todo,
): Todo {
  const timing = (() => {
    if (values.timingKind === 'unscheduled') return { kind: 'unscheduled' as const };
    if (values.timingKind === 'allDay') {
      return {
        kind: 'allDay' as const,
        startDate: values.date,
        endDateExclusive: values.allDayEndDate,
        timezone,
      };
    }
    return {
      kind: 'timed' as const,
      startAt: wallClock(values.date, values.startTime, timezone),
      dueAt: wallClock(values.dueDate, values.dueTime, timezone),
      timezone,
    };
  })();

  return TodoSchema.parse({
    id: existing?.id ?? id,
    title: values.title,
    notes: values.notes,
    categoryId: null,
    priority: values.priority,
    status: existing?.status ?? 'open',
    timing,
    reminders: values.timingKind === 'unscheduled' ? [] : values.reminders,
    recurrence: values.timingKind === 'unscheduled' ? null : values.recurrence,
    completedAt: existing?.completedAt ?? null,
    version: existing === undefined ? 1 : existing.version + 1,
  });
}
