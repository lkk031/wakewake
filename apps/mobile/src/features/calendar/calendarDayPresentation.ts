import { weekdayOf } from '@wakewake/domain';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export interface CalendarDayPresentation {
  accessibilityLabel: string;
  isSelected: boolean;
  isToday: boolean;
  visibleWeekday: string;
  weekday: string;
}

export function calendarWeekday(date: string): string {
  return WEEKDAYS[weekdayOf(date)] ?? '';
}

export function getCalendarDayPresentation(
  date: string,
  today: string,
  selectedDate: string,
): CalendarDayPresentation {
  const weekday = calendarWeekday(date);
  const isToday = date === today;
  return {
    accessibilityLabel: `${date}，${isToday ? '今天，' : ''}星期${weekday}`,
    isSelected: date === selectedDate,
    isToday,
    visibleWeekday: isToday ? '今' : weekday,
    weekday,
  };
}
