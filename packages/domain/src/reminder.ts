import { z } from 'zod';
import type { TodoTiming } from './todo';
import { startOfLocalDateAtHour } from './timezone';

export const MAX_REMINDERS_PER_TODO = 10;
export const MAX_REMINDER_OFFSET_MINUTES = 525_600;
export const DEFAULT_REMINDER_OFFSETS = [1_440, 60, 10] as const;
export const DEFAULT_REMINDER_TEMPLATES = DEFAULT_REMINDER_OFFSETS.map((offsetMinutes) => ({
  anchor: 'due' as const,
  offsetMinutes,
}));

export const ReminderAnchorSchema = z.enum(['start', 'due']);

export const ReminderRuleSchema = z.strictObject({
  id: z.uuid(),
  anchor: ReminderAnchorSchema,
  offsetMinutes: z.int().min(0).max(MAX_REMINDER_OFFSET_MINUTES),
});

export const ReminderRulesSchema = z
  .array(ReminderRuleSchema)
  .max(MAX_REMINDERS_PER_TODO)
  .refine(
    (rules) =>
      new Set(rules.map((rule) => `${rule.anchor}\0${rule.offsetMinutes}`)).size === rules.length,
    '同一时间基准的提醒时间不能重复',
  );

export type ReminderAnchor = z.infer<typeof ReminderAnchorSchema>;
export type ReminderRule = z.infer<typeof ReminderRuleSchema>;

type LegacyReminderBase = { startAt?: Date | null; dueAt?: Date | null };

export function getReminderBase(timing: TodoTiming, anchor?: ReminderAnchor): Date | null;
/** @deprecated Pass TodoTiming. Kept for callers using the original flat shape. */
export function getReminderBase(timing: LegacyReminderBase, anchor?: ReminderAnchor): Date | null;
export function getReminderBase(
  timing: TodoTiming | LegacyReminderBase,
  anchor: ReminderAnchor = 'due',
): Date | null {
  if ('kind' in timing) {
    switch (timing.kind) {
      case 'unscheduled':
        return null;
      case 'timed':
        return anchor === 'start' ? timing.startAt : timing.dueAt;
      case 'allDay':
        return anchor === 'start'
          ? startOfLocalDateAtHour(timing.startDate, 9, timing.timezone)
          : null;
    }
  }

  return anchor === 'start' ? (timing.startAt ?? null) : (timing.dueAt ?? null);
}

export function calculateReminderAt(base: Date, offsetMinutes: number): Date {
  return new Date(base.getTime() - offsetMinutes * 60_000);
}

export function getFutureReminderTimes(
  base: Date,
  rules: readonly Pick<ReminderRule, 'offsetMinutes'>[],
  now: Date,
): Date[] {
  return rules
    .map((rule) => calculateReminderAt(base, rule.offsetMinutes))
    .filter((scheduledAt) => scheduledAt.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
}
