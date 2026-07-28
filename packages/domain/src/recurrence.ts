import { z } from 'zod';

export const WeekdaySchema = z.int().min(0).max(6);

export const RecurrenceEndSchema = z.object({ kind: z.literal('never') });

const RecurrenceBaseShape = {
  interval: z.literal(1),
  end: RecurrenceEndSchema,
};

export const DailyRecurrenceSchema = z.object({
  frequency: z.literal('daily'),
  ...RecurrenceBaseShape,
});

export const WeeklyRecurrenceSchema = z
  .object({
    frequency: z.literal('weekly'),
    ...RecurrenceBaseShape,
    weekdays: z.array(WeekdaySchema).min(1).max(7),
  })
  .transform((rule) => ({
    ...rule,
    weekdays: [...new Set(rule.weekdays)].sort((a, b) => a - b),
  }));

// z.union is intentional: a transformed branch cannot be nested in z.discriminatedUnion.
export const RecurrenceRuleSchema = z.union([DailyRecurrenceSchema, WeeklyRecurrenceSchema]);

export type RecurrenceEnd = z.infer<typeof RecurrenceEndSchema>;
export type DailyRecurrenceRule = z.infer<typeof DailyRecurrenceSchema>;
export type WeeklyRecurrenceRule = z.infer<typeof WeeklyRecurrenceSchema>;
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;
export type RecurrenceRuleInput = z.input<typeof RecurrenceRuleSchema>;
