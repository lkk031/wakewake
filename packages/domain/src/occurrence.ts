import { z } from 'zod';
import type { RecurrenceRule } from './recurrence';
import type { Todo, TodoTiming } from './todo';
import {
  addCalendarDays,
  calendarDaysBetween,
  formatWallClockDateTime,
  getWallClockDateTime,
  localDateAt,
  startOfLocalDateAtHour,
  wallClockToInstant,
  weekdayOf,
} from './timezone';

export const MAX_OCCURRENCE_WINDOW_DAYS = 3_660;
export const MAX_EXPANDED_OCCURRENCES = 10_000;

const InstantSchema = z.coerce.date();

export const OccurrenceStatusSchema = z.enum(['open', 'completed', 'cancelled']);

export const OccurrenceStateSchema = z
  .object({
    todoId: z.uuid(),
    occurrenceKey: z.string().min(1),
    status: OccurrenceStatusSchema.default('open'),
    completedAt: InstantSchema.nullable().default(null),
    version: z.int().min(1).default(1),
  })
  .superRefine((state, context) => {
    if (state.status === 'completed' && state.completedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: '已完成实例必须记录完成时间',
      });
    }
    if (state.status !== 'completed' && state.completedAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: '未完成实例不能记录完成时间',
      });
    }
  });

const OccurrenceTimingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('timed'),
    startAt: InstantSchema.nullable(),
    dueAt: InstantSchema.nullable(),
    timezone: z.string().min(1),
  }),
  z.object({
    kind: z.literal('allDay'),
    startDate: z.iso.date(),
    endDateExclusive: z.iso.date(),
    timezone: z.string().min(1),
  }),
]);

export const TodoOccurrenceSchema = z.object({
  todoId: z.uuid(),
  occurrenceKey: z.string().min(1),
  timing: OccurrenceTimingSchema,
});

export type OccurrenceStatus = z.infer<typeof OccurrenceStatusSchema>;
export type OccurrenceState = z.infer<typeof OccurrenceStateSchema>;
export type TodoOccurrence = z.infer<typeof TodoOccurrenceSchema>;

export interface OccurrenceExpansion {
  todoId: string;
  timing: Exclude<TodoTiming, { kind: 'unscheduled' }>;
  recurrence: RecurrenceRule;
}

export interface OccurrenceWindow {
  start: Date;
  end: Date;
}

function assertValidWindow(window: OccurrenceWindow): void {
  if (!Number.isFinite(window.start.getTime()) || !Number.isFinite(window.end.getTime())) {
    throw new RangeError('Occurrence window must contain valid dates');
  }
  if (window.end.getTime() <= window.start.getTime()) {
    throw new RangeError('Occurrence window end must be after its start');
  }
  if (window.end.getTime() - window.start.getTime() > MAX_OCCURRENCE_WINDOW_DAYS * 86_400_000) {
    throw new RangeError(`Occurrence window cannot exceed ${MAX_OCCURRENCE_WINDOW_DAYS} days`);
  }
}

function happensOn(rule: RecurrenceRule, anchorDate: string, candidateDate: string): boolean {
  if (candidateDate < anchorDate) {
    return false;
  }
  if (rule.frequency === 'daily') {
    return true;
  }
  return rule.weekdays.includes(weekdayOf(candidateDate));
}

function allDayOccurrence(
  todoId: string,
  timing: Extract<TodoTiming, { kind: 'allDay' }>,
  date: string,
): TodoOccurrence {
  const durationDays = calendarDaysBetween(timing.startDate, timing.endDateExclusive);
  return {
    todoId,
    occurrenceKey: date,
    timing: {
      kind: 'allDay',
      startDate: date,
      endDateExclusive: addCalendarDays(date, durationDays),
      timezone: timing.timezone,
    },
  };
}

function timedOccurrence(
  todoId: string,
  timing: Extract<TodoTiming, { kind: 'timed' }>,
  anchor: Date,
  date: string,
): TodoOccurrence {
  const anchorWall = getWallClockDateTime(anchor, timing.timezone);
  const candidateStart = wallClockToInstant({ ...anchorWall, ...dateParts(date) }, timing.timezone);
  const shift = candidateStart.getTime() - anchor.getTime();
  return {
    todoId,
    occurrenceKey: formatWallClockDateTime({ ...anchorWall, ...dateParts(date) }),
    timing: {
      kind: 'timed',
      startAt: timing.startAt === null ? null : new Date(timing.startAt.getTime() + shift),
      dueAt: timing.dueAt === null ? null : new Date(timing.dueAt.getTime() + shift),
      timezone: timing.timezone,
    },
  };
}

function dateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return { year, month, day };
}

/**
 * Expands a recurring series inside the half-open instant window [start, end).
 * A finite window is mandatory; callers should use their visible/scheduling range.
 */
export function expandOccurrences(
  series: OccurrenceExpansion,
  window: OccurrenceWindow,
): TodoOccurrence[];
export function expandOccurrences(
  series: Pick<Todo, 'id' | 'timing' | 'recurrence'>,
  window: OccurrenceWindow,
): TodoOccurrence[];
export function expandOccurrences(
  series: OccurrenceExpansion | Pick<Todo, 'id' | 'timing' | 'recurrence'>,
  window: OccurrenceWindow,
): TodoOccurrence[] {
  assertValidWindow(window);
  if (series.recurrence === null || series.timing.kind === 'unscheduled') {
    return [];
  }

  const todoId = 'todoId' in series ? series.todoId : series.id;
  const recurrence = series.recurrence;
  const timing = series.timing;
  const timezone = timing.timezone;
  const anchorInstant =
    timing.kind === 'allDay'
      ? startOfLocalDateAtHour(timing.startDate, 0, timezone)
      : (timing.startAt ?? timing.dueAt);
  if (anchorInstant === null) {
    return [];
  }

  const anchorDate =
    timing.kind === 'allDay' ? timing.startDate : localDateAt(anchorInstant, timezone);
  const durationDays =
    timing.kind === 'allDay'
      ? calendarDaysBetween(timing.startDate, timing.endDateExclusive)
      : Math.ceil(
          Math.max(
            0,
            (timing.dueAt ?? timing.startAt ?? anchorInstant).getTime() -
              (timing.startAt ?? timing.dueAt ?? anchorInstant).getTime(),
          ) / 86_400_000,
        );
  if (durationDays > MAX_OCCURRENCE_WINDOW_DAYS) {
    throw new RangeError(`Occurrence duration cannot exceed ${MAX_OCCURRENCE_WINDOW_DAYS} days`);
  }

  // Look back far enough to include an occurrence that begins before the window
  // and overlaps its left edge. The extra day covers a DST offset transition.
  let candidateDate = addCalendarDays(localDateAt(window.start, timezone), -(durationDays + 1));
  if (candidateDate < anchorDate) {
    candidateDate = anchorDate;
  }
  const finalDate = localDateAt(new Date(window.end.getTime() - 1), timezone);
  const occurrences: TodoOccurrence[] = [];

  while (candidateDate <= finalDate) {
    if (happensOn(recurrence, anchorDate, candidateDate)) {
      const occurrence =
        timing.kind === 'allDay'
          ? allDayOccurrence(todoId, timing, candidateDate)
          : timedOccurrence(todoId, timing, anchorInstant, candidateDate);
      const occurrenceStart =
        occurrence.timing.kind === 'allDay'
          ? startOfLocalDateAtHour(occurrence.timing.startDate, 0, timezone)
          : (occurrence.timing.startAt ?? occurrence.timing.dueAt);
      const occurrenceEnd =
        occurrence.timing.kind === 'allDay'
          ? startOfLocalDateAtHour(occurrence.timing.endDateExclusive, 0, timezone)
          : (occurrence.timing.dueAt ?? occurrence.timing.startAt);

      if (
        occurrenceStart !== null &&
        occurrenceEnd !== null &&
        occurrenceStart.getTime() < window.end.getTime() &&
        occurrenceEnd.getTime() >= window.start.getTime()
      ) {
        occurrences.push(occurrence);
        if (occurrences.length > MAX_EXPANDED_OCCURRENCES) {
          throw new RangeError(`Cannot expand more than ${MAX_EXPANDED_OCCURRENCES} occurrences`);
        }
      }
    }
    candidateDate = addCalendarDays(candidateDate, 1);
  }

  return occurrences;
}

export const expandTodoOccurrences = expandOccurrences;
