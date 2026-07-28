import { z } from 'zod';
import { OccurrenceStateSchema } from './occurrence';
import { ReminderRulesSchema } from './reminder';
import { TodoSchema } from './todo';
import { IanaTimezoneSchema } from './timezone';

export const BACKUP_FORMAT = 'wakewake-backup' as const;
export const BACKUP_VERSION = 1 as const;

export const ThemeModeSchema = z.enum(['system', 'light', 'dark']);

export const BackupSettingsSchema = z.strictObject({
  themeMode: ThemeModeSchema.default('system'),
  timezoneMode: z.enum(['system', 'fixed']).default('system'),
  timezone: IanaTimezoneSchema,
  locale: z.string().min(1).default('zh-CN'),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
  defaultDurationMinutes: z.int().min(1).max(1_440).default(30),
});

/**
 * Portable user-owned domain data only. Native notification identifiers and
 * scheduling maps are intentionally not part of this schema and are rejected.
 */
export const BackupV1Schema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.coerce.date(),
  todos: z.array(TodoSchema),
  occurrenceStates: z.array(OccurrenceStateSchema),
  settings: BackupSettingsSchema,
  defaultReminders: ReminderRulesSchema,
});

export const BackupSchema = z.discriminatedUnion('version', [BackupV1Schema]);

export type ThemeMode = z.infer<typeof ThemeModeSchema>;
export type BackupSettings = z.infer<typeof BackupSettingsSchema>;
export type BackupV1 = z.infer<typeof BackupV1Schema>;
export type Backup = z.infer<typeof BackupSchema>;
export type BackupInput = z.input<typeof BackupSchema>;
