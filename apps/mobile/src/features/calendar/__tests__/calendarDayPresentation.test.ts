import { describe, expect, it } from 'vitest';

import { getCalendarDayPresentation } from '../calendarDayPresentation';

describe('calendar day presentation', () => {
  it('uses the real weekday for an ordinary unselected day', () => {
    expect(getCalendarDayPresentation('2026-07-28', '2026-07-27', '2026-07-29')).toEqual({
      accessibilityLabel: '2026-07-28，星期二',
      isSelected: false,
      isToday: false,
      visibleWeekday: '二',
      weekday: '二',
    });
  });

  it('shows 今 while preserving today and the real weekday in accessibility text', () => {
    expect(getCalendarDayPresentation('2026-07-27', '2026-07-27', '2026-07-28')).toEqual({
      accessibilityLabel: '2026-07-27，今天，星期一',
      isSelected: false,
      isToday: true,
      visibleWeekday: '今',
      weekday: '一',
    });
  });

  it('keeps selection independent from today', () => {
    const selected = getCalendarDayPresentation('2026-07-28', '2026-07-27', '2026-07-28');
    const todayAndSelected = getCalendarDayPresentation('2026-07-27', '2026-07-27', '2026-07-27');

    expect(selected).toMatchObject({ isToday: false, isSelected: true, visibleWeekday: '二' });
    expect(todayAndSelected).toMatchObject({
      isToday: true,
      isSelected: true,
      visibleWeekday: '今',
    });
  });
});
