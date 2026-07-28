import { z } from 'zod';

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export interface WallClockDateTime extends CalendarDateParts {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return timezone.length > 0;
  } catch {
    return false;
  }
}

export const IanaTimezoneSchema = z
  .string()
  .min(1)
  .refine(isValidIanaTimezone, '必须是有效的 IANA 时区');

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached !== undefined) {
    return cached;
  }

  if (!isValidIanaTimezone(timezone)) {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }

  const formatter = new Intl.DateTimeFormat('en-US-u-ca-iso8601-nu-latn', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

function numericPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new RangeError(`Intl formatter did not return ${type}`);
  }
  return Number(value);
}

export function getWallClockDateTime(instant: Date, timezone: string): WallClockDateTime {
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError('Invalid instant');
  }

  const parts = getFormatter(timezone).formatToParts(instant);
  return {
    year: numericPart(parts, 'year'),
    month: numericPart(parts, 'month'),
    day: numericPart(parts, 'day'),
    hour: numericPart(parts, 'hour'),
    minute: numericPart(parts, 'minute'),
    second: numericPart(parts, 'second'),
    millisecond: instant.getUTCMilliseconds(),
  };
}

function toEpochLikeUtc(parts: WallClockDateTime): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

function sameWallClock(a: WallClockDateTime, b: WallClockDateTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second &&
    a.millisecond === b.millisecond
  );
}

function offsetAt(instantMs: number, timezone: string): number {
  const instant = new Date(instantMs);
  return toEpochLikeUtc(getWallClockDateTime(instant, timezone)) - instantMs;
}

/**
 * Converts a local wall-clock value to an instant without relying on the host timezone.
 * Ambiguous values use the first occurrence. A value inside a DST gap is shifted
 * forward by the gap, matching the application's nonexistent-time policy.
 */
export function wallClockToInstant(parts: WallClockDateTime, timezone: string): Date {
  const wallMs = toEpochLikeUtc(parts);
  const offsets = new Set<number>();

  for (let hours = -48; hours <= 48; hours += 6) {
    offsets.add(offsetAt(wallMs + hours * 3_600_000, timezone));
  }

  const exact: number[] = [];
  const shiftedForward: Array<{ instantMs: number; wallMs: number }> = [];
  for (const offset of offsets) {
    const instantMs = wallMs - offset;
    const actual = getWallClockDateTime(new Date(instantMs), timezone);
    if (sameWallClock(actual, parts)) {
      exact.push(instantMs);
      continue;
    }

    const actualWallMs = toEpochLikeUtc(actual);
    if (actualWallMs > wallMs && actualWallMs - wallMs <= 3 * 3_600_000) {
      shiftedForward.push({ instantMs, wallMs: actualWallMs });
    }
  }

  if (exact.length > 0) {
    return new Date(Math.min(...exact));
  }

  shiftedForward.sort((a, b) => a.wallMs - b.wallMs || a.instantMs - b.instantMs);
  const shifted = shiftedForward[0];
  if (shifted !== undefined) {
    return new Date(shifted.instantMs);
  }

  throw new RangeError('Unable to resolve wall-clock time in timezone');
}

export function parseCalendarDate(value: string): CalendarDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new RangeError(`Invalid calendar date: ${value}`);
  }

  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function formatCalendarDate(parts: CalendarDateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

export function addCalendarDays(value: string, days: number): string {
  const parts = parseCalendarDate(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatCalendarDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function calendarDaysBetween(from: string, to: string): number {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  return (
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
    86_400_000
  );
}

export function weekdayOf(value: string): number {
  const parts = parseCalendarDate(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function localDateAt(instant: Date, timezone: string): string {
  return formatCalendarDate(getWallClockDateTime(instant, timezone));
}

export function startOfLocalDateAtHour(date: string, hour: number, timezone: string): Date {
  const parts = parseCalendarDate(date);
  return wallClockToInstant({ ...parts, hour, minute: 0, second: 0, millisecond: 0 }, timezone);
}

export function formatWallClockDateTime(parts: WallClockDateTime): string {
  const date = formatCalendarDate(parts);
  const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(
    parts.second,
  ).padStart(2, '0')}`;
  return parts.millisecond === 0
    ? `${date}T${time}`
    : `${date}T${time}.${String(parts.millisecond).padStart(3, '0')}`;
}
