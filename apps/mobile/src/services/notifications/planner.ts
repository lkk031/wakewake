import {
  calculateReminderAt,
  expandOccurrences,
  getReminderBase,
  MAX_REMINDER_OFFSET_MINUTES,
  type OccurrenceState,
  type ReminderRule,
  type Todo,
  type TodoTiming,
} from '@wakewake/domain';

export const NOTIFICATION_HORIZON_DAYS = 30;
export const MAX_MANAGED_NOTIFICATIONS = 256;

export interface DesiredNotification {
  logicalKey: string;
  todoId: string;
  occurrenceKey: string | null;
  reminderRuleId: string;
  scheduledAt: Date;
}

export interface NotificationPlan {
  notifications: DesiredNotification[];
  truncated: boolean;
}

export interface NotificationPlanningOptions {
  now?: Date;
  horizonDays?: number;
  maxNotifications?: number;
}

export function planNotifications(
  todos: readonly Todo[],
  occurrenceStates: readonly OccurrenceState[],
  options: NotificationPlanningOptions = {},
): NotificationPlan {
  const now = options.now ?? new Date();
  const horizonDays = options.horizonDays ?? NOTIFICATION_HORIZON_DAYS;
  const maxNotifications = options.maxNotifications ?? MAX_MANAGED_NOTIFICATIONS;
  if (horizonDays <= 0 || maxNotifications <= 0) {
    throw new RangeError('Notification horizon and limit must be positive');
  }

  const horizonEnd = new Date(now.getTime() + horizonDays * 86_400_000);
  const largestOffset = todos.reduce(
    (largest, todo) => Math.max(largest, ...todo.reminders.map((rule) => rule.offsetMinutes)),
    0,
  );
  const planningStart = new Date(now.getTime() - largestOffset * 60_000);
  const stateByKey = new Map(
    occurrenceStates.map((state) => [`${state.todoId}\0${state.occurrenceKey}`, state]),
  );
  const desired: DesiredNotification[] = [];

  for (const todo of todos) {
    if (
      todo.status !== 'open' ||
      todo.timing.kind === 'unscheduled' ||
      todo.reminders.length === 0
    ) {
      continue;
    }

    if (todo.recurrence === null) {
      appendReminderSchedules(desired, todo, null, todo.timing, todo.reminders, now, horizonEnd);
      continue;
    }

    const todoLargestOffset = Math.min(
      MAX_REMINDER_OFFSET_MINUTES,
      Math.max(...todo.reminders.map((rule) => rule.offsetMinutes)),
    );
    const expansionEnd = new Date(horizonEnd.getTime() + todoLargestOffset * 60_000);
    for (const occurrence of expandOccurrences(todo, { start: planningStart, end: expansionEnd })) {
      const state = stateByKey.get(`${todo.id}\0${occurrence.occurrenceKey}`);
      if (state !== undefined && state.status !== 'open') continue;
      appendReminderSchedules(
        desired,
        todo,
        occurrence.occurrenceKey,
        occurrence.timing,
        todo.reminders,
        now,
        horizonEnd,
      );
    }
  }

  desired.sort(
    (a, b) =>
      a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.logicalKey.localeCompare(b.logicalKey),
  );
  return {
    notifications: desired.slice(0, maxNotifications),
    truncated: desired.length > maxNotifications,
  };
}

function appendReminderSchedules(
  output: DesiredNotification[],
  todo: Todo,
  occurrenceKey: string | null,
  timing: Exclude<TodoTiming, { kind: 'unscheduled' }>,
  reminders: readonly ReminderRule[],
  now: Date,
  horizonEnd: Date,
): void {
  const base = getReminderBase(timing);
  if (base === null) return;

  for (const rule of reminders) {
    const scheduledAt = calculateReminderAt(base, rule.offsetMinutes);
    if (scheduledAt <= now || scheduledAt > horizonEnd) continue;
    output.push({
      logicalKey: notificationLogicalKey(todo.id, occurrenceKey, rule.id, scheduledAt),
      todoId: todo.id,
      occurrenceKey,
      reminderRuleId: rule.id,
      scheduledAt,
    });
  }
}

export function notificationLogicalKey(
  todoId: string,
  occurrenceKey: string | null,
  reminderRuleId: string,
  scheduledAt: Date,
): string {
  return [
    'wakewake-v1',
    todoId,
    occurrenceKey ?? 'single',
    reminderRuleId,
    scheduledAt.toISOString(),
  ].join('|');
}
