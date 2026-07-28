import { z } from 'zod';
import { RecurrenceRuleSchema } from './recurrence';
import { ReminderRulesSchema } from './reminder';
import { IanaTimezoneSchema, localDateAt } from './timezone';

export const PrioritySchema = z.enum(['none', 'low', 'medium', 'high']);
export const TodoStatusSchema = z.enum(['open', 'completed']);

const InstantSchema = z.coerce.date();

export const TodoTimingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unscheduled') }),
  z
    .object({
      kind: z.literal('timed'),
      startAt: InstantSchema.nullable(),
      dueAt: InstantSchema.nullable(),
      timezone: IanaTimezoneSchema,
    })
    .refine((timing) => timing.startAt !== null || timing.dueAt !== null, {
      message: '定时事项至少需要开始时间或截止时间',
    })
    .refine(
      (timing) =>
        timing.startAt === null ||
        timing.dueAt === null ||
        timing.dueAt.getTime() >= timing.startAt.getTime(),
      { message: '截止时间不能早于开始时间' },
    ),
  z
    .object({
      kind: z.literal('allDay'),
      startDate: z.iso.date(),
      endDateExclusive: z.iso.date(),
      timezone: IanaTimezoneSchema,
    })
    .refine((timing) => timing.endDateExclusive > timing.startDate, {
      message: '全天事项结束日期必须晚于开始日期',
    }),
]);

export const TodoSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(5_000).default(''),
    categoryId: z.uuid().nullable(),
    priority: PrioritySchema.default('none'),
    status: TodoStatusSchema.default('open'),
    timing: TodoTimingSchema,
    reminders: ReminderRulesSchema.default([]),
    recurrence: RecurrenceRuleSchema.nullable().default(null),
    completedAt: InstantSchema.nullable().default(null),
    version: z.int().min(1).default(1),
  })
  .superRefine((todo, context) => {
    if (todo.timing.kind === 'unscheduled' && todo.reminders.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['reminders'],
        message: '无日期事项不能设置提醒',
      });
    }
    if (todo.timing.kind === 'unscheduled' && todo.recurrence !== null) {
      context.addIssue({
        code: 'custom',
        path: ['recurrence'],
        message: '无日期事项不能设置重复',
      });
    }
    if (todo.status === 'open' && todo.completedAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: '未完成事项不能记录完成时间',
      });
    }
    if (todo.status === 'completed' && todo.completedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: '已完成事项必须记录完成时间',
      });
    }
    if (todo.recurrence !== null && todo.status === 'completed') {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: '重复系列不能整体完成，请完成具体实例',
      });
    }
  });

export type Priority = z.infer<typeof PrioritySchema>;
export type TodoStatus = z.infer<typeof TodoStatusSchema>;
export type TodoTiming = z.infer<typeof TodoTimingSchema>;
export type Todo = z.infer<typeof TodoSchema>;

/**
 * Timed todos compare their due instant. All-day todos become overdue when the
 * exclusive end date has started in the todo timezone (a one-day todo is not
 * overdue during its own calendar day).
 */
export function isOverdue(todo: Pick<Todo, 'status' | 'timing'>, now: Date): boolean {
  if (todo.status !== 'open') {
    return false;
  }

  if (todo.timing.kind === 'timed') {
    return todo.timing.dueAt !== null && todo.timing.dueAt.getTime() < now.getTime();
  }

  if (todo.timing.kind === 'allDay') {
    return localDateAt(now, todo.timing.timezone) >= todo.timing.endDateExclusive;
  }

  return false;
}
