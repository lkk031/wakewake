import { addCalendarDays } from '@wakewake/domain';

export function normalizeQuickCreateDateParam(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  try {
    return addCalendarDays(value, 0) === value ? value : undefined;
  } catch {
    return undefined;
  }
}
