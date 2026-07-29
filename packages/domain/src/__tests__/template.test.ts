import { describe, expect, it } from 'vitest';

import {
  createDefaultTodoTemplates,
  MAX_TEMPLATE_DURATION_MINUTES,
  MAX_TODO_TEMPLATES,
  TodoTemplateSchema,
  TodoTemplatesSchema,
} from '../index';

const template = {
  id: '6fca9198-7c59-4f03-84c0-d14b796bbdf1',
  name: '会议',
  durationMinutes: 30,
  reminders: [
    {
      id: 'a469916e-4eaf-467c-b8c7-4123a594ce93',
      anchor: 'start' as const,
      offsetMinutes: 10,
    },
  ],
};

describe('TodoTemplateSchema', () => {
  it('trims names and accepts dual-anchor reminders', () => {
    expect(
      TodoTemplateSchema.parse({
        ...template,
        name: '  会议  ',
        reminders: [
          template.reminders[0],
          {
            id: '5b3e73d5-3971-46eb-8392-ad086e7d76ef',
            anchor: 'due',
            offsetMinutes: 10,
          },
        ],
      }),
    ).toMatchObject({ name: '会议', durationMinutes: 30 });
  });

  it('enforces name, duration, and reminder limits', () => {
    expect(TodoTemplateSchema.safeParse({ ...template, name: ' ' }).success).toBe(false);
    expect(TodoTemplateSchema.safeParse({ ...template, name: 'a'.repeat(81) }).success).toBe(false);
    expect(TodoTemplateSchema.safeParse({ ...template, durationMinutes: 0 }).success).toBe(false);
    expect(
      TodoTemplateSchema.safeParse({
        ...template,
        durationMinutes: MAX_TEMPLATE_DURATION_MINUTES + 1,
      }).success,
    ).toBe(false);
    expect(
      TodoTemplateSchema.safeParse({
        ...template,
        reminders: Array.from({ length: 11 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          anchor: 'start',
          offsetMinutes: index,
        })),
      }).success,
    ).toBe(false);
  });
});

describe('TodoTemplatesSchema', () => {
  it('rejects case-insensitive duplicate names', () => {
    expect(
      TodoTemplatesSchema.safeParse([
        template,
        {
          ...template,
          id: '2ef78afb-897e-42bd-9050-4dacb2ec8278',
          name: '  会 议  ',
        },
      ]).success,
    ).toBe(true);
    expect(
      TodoTemplatesSchema.safeParse([
        { ...template, name: 'Meeting' },
        {
          ...template,
          id: '2ef78afb-897e-42bd-9050-4dacb2ec8278',
          name: ' meeting ',
        },
      ]).success,
    ).toBe(false);
  });

  it('limits the collection to 50 templates', () => {
    const templates = Array.from({ length: MAX_TODO_TEMPLATES + 1 }, (_, index) => ({
      ...template,
      id: `00000000-0000-4000-8001-${String(index).padStart(12, '0')}`,
      name: `模板 ${index}`,
    }));
    expect(TodoTemplatesSchema.safeParse(templates).success).toBe(false);
  });

  it('returns independent deterministic defaults', () => {
    const first = createDefaultTodoTemplates();
    const second = createDefaultTodoTemplates();
    expect(first.map((item) => item.name)).toEqual(['会议', '作业截止']);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]?.reminders).not.toBe(second[0]?.reminders);
  });
});
