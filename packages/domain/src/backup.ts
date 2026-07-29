import { z } from 'zod';
import { OccurrenceStateSchema } from './occurrence';
import { RecurrenceRuleSchema } from './recurrence';
import {
  MAX_REMINDERS_PER_TODO,
  MAX_REMINDER_OFFSET_MINUTES,
  ReminderRulesSchema,
} from './reminder';
import { TodoTemplatesSchema } from './template';
import { PrioritySchema, TodoSchema, TodoStatusSchema, TodoTimingSchema } from './todo';
import { IanaTimezoneSchema } from './timezone';

export const BACKUP_FORMAT = 'wakewake-backup' as const;
export const BACKUP_VERSION = 3 as const;
export const PREVIOUS_BACKUP_VERSION = 2 as const;
export const LEGACY_BACKUP_VERSION = 1 as const;

export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);

export const BackupSettingsSchema = z.strictObject({
  themeMode: ThemeModeSchema.default('system'),
  timezoneMode: z.enum(['system', 'fixed']).default('system'),
  timezone: IanaTimezoneSchema,
  locale: z.string().min(1).default('zh-CN'),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
  defaultDurationMinutes: z.int().min(1).max(1_440).default(30),
});

const BackupV1ReminderRuleSchema = z.strictObject({
  id: z.uuid(),
  offsetMinutes: z.int().min(0).max(MAX_REMINDER_OFFSET_MINUTES),
});

const BackupV1ReminderRulesSchema = z
  .array(BackupV1ReminderRuleSchema)
  .max(MAX_REMINDERS_PER_TODO)
  .refine(
    (rules) => new Set(rules.map((rule) => rule.offsetMinutes)).size === rules.length,
    '提醒时间不能重复',
  );

const BackupV1TodoSchema = z
  .strictObject({
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(5_000).default(''),
    categoryId: z.uuid().nullable(),
    priority: PrioritySchema.default('none'),
    status: TodoStatusSchema.default('open'),
    timing: TodoTimingSchema,
    reminders: BackupV1ReminderRulesSchema.default([]),
    recurrence: RecurrenceRuleSchema.nullable().default(null),
    completedAt: z.coerce.date().nullable().default(null),
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

const BackupEnvelopeShape = {
  format: z.literal(BACKUP_FORMAT),
  exportedAt: z.coerce.date(),
  occurrenceStates: z.array(OccurrenceStateSchema),
  settings: BackupSettingsSchema,
};

/** Legacy wire format. Reminder rules intentionally do not accept an anchor. */
export const BackupV1Schema = z.strictObject({
  ...BackupEnvelopeShape,
  version: z.literal(LEGACY_BACKUP_VERSION),
  todos: z.array(BackupV1TodoSchema),
  defaultReminders: BackupV1ReminderRulesSchema,
});

/** Current portable format. Native notification mappings are intentionally omitted. */
export const BackupV2Schema = z.strictObject({
  ...BackupEnvelopeShape,
  version: z.literal(PREVIOUS_BACKUP_VERSION),
  todos: z.array(TodoSchema),
  defaultReminders: ReminderRulesSchema,
});

/** Current portable format. Native notification mappings are intentionally omitted. */
export const BackupV3Schema = z.strictObject({
  ...BackupEnvelopeShape,
  version: z.literal(BACKUP_VERSION),
  todos: z.array(TodoSchema),
  defaultReminders: ReminderRulesSchema,
  templates: TodoTemplatesSchema,
});

export const BackupSchema = z.discriminatedUnion('version', [
  BackupV1Schema,
  BackupV2Schema,
  BackupV3Schema,
]);

export type ThemeMode = z.infer<typeof ThemeModeSchema>;
export type BackupSettings = z.infer<typeof BackupSettingsSchema>;
export type BackupV1 = z.infer<typeof BackupV1Schema>;
export type BackupV2 = z.infer<typeof BackupV2Schema>;
export type BackupV3 = z.infer<typeof BackupV3Schema>;
export type Backup = z.infer<typeof BackupSchema>;
export type BackupInput = z.input<typeof BackupSchema>;
