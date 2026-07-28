import { getCalendars } from 'expo-localization';
import { isValidIanaTimezone } from '@wakewake/domain';

export function getDeviceTimezone(): string {
  const calendarTimezone = getCalendars()[0]?.timeZone;
  if (calendarTimezone && isValidIanaTimezone(calendarTimezone)) return calendarTimezone;

  const intlTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidIanaTimezone(intlTimezone) ? intlTimezone : 'UTC';
}
