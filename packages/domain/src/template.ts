import { z } from 'zod';
import { ReminderRulesSchema } from './reminder';

export const MAX_TODO_TEMPLATES = 50;
export const MAX_TEMPLATE_DURATION_MINUTES = 1_440;

export const TodoTemplateSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  durationMinutes: z.int().min(1).max(MAX_TEMPLATE_DURATION_MINUTES),
  reminders: ReminderRulesSchema.default([]),
});

export const TodoTemplatesSchema = z
  .array(TodoTemplateSchema)
  .max(MAX_TODO_TEMPLATES)
  .superRefine((templates, context) => {
    const names = new Set<string>();
    for (const [index, template] of templates.entries()) {
      const normalizedName = template.name.trim().toLocaleLowerCase();
      if (names.has(normalizedName)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: '模板名称不能重复',
        });
      }
      names.add(normalizedName);
    }
  });

export type TodoTemplate = z.infer<typeof TodoTemplateSchema>;

const DEFAULT_TEMPLATE_VALUES = [
  {
    id: '00000000-0000-4000-8001-000000000001',
    name: '会议',
    durationMinutes: 30,
    reminders: [
      {
        id: '00000000-0000-4000-8001-000000000101',
        anchor: 'start' as const,
        offsetMinutes: 10,
      },
    ],
  },
  {
    id: '00000000-0000-4000-8001-000000000002',
    name: '作业截止',
    durationMinutes: 1_440,
    reminders: [
      {
        id: '00000000-0000-4000-8001-000000000201',
        anchor: 'due' as const,
        offsetMinutes: 1_440,
      },
      {
        id: '00000000-0000-4000-8001-000000000202',
        anchor: 'due' as const,
        offsetMinutes: 60,
      },
    ],
  },
] as const;

export function createDefaultTodoTemplates(): TodoTemplate[] {
  return DEFAULT_TEMPLATE_VALUES.map((template) =>
    TodoTemplateSchema.parse({
      ...template,
      reminders: template.reminders.map((reminder) => ({ ...reminder })),
    }),
  );
}

export const DEFAULT_TODO_TEMPLATES: readonly Readonly<
  Omit<TodoTemplate, 'reminders'> & {
    reminders: readonly Readonly<TodoTemplate['reminders'][number]>[];
  }
>[] = DEFAULT_TEMPLATE_VALUES;
