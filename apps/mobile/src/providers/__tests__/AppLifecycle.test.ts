import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({ focusManager: { setFocused: vi.fn() } }));
vi.mock('react', () => ({ useEffect: vi.fn() }));
vi.mock('react-native', () => ({
  AppState: { currentState: null, addEventListener: vi.fn() },
}));
vi.mock('@/query/notificationQueries', () => ({ reconcileNotificationsSafely: vi.fn() }));
vi.mock('@/query/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock('@/query/queryKeys', () => ({
  notificationKeys: { permission: ['notifications', 'permission'] },
  settingsKeys: { all: ['settings'] },
  todoKeys: { all: ['todos'] },
}));
vi.mock('@/services/localization/deviceTimezone', () => ({ getDeviceTimezone: vi.fn() }));
vi.mock('../AppServicesProvider', () => ({ useAppServices: vi.fn() }));

import { createAppStateObserver } from '../AppLifecycle';

describe('app lifecycle state observer', () => {
  it.each(['active', 'inactive', null] as const)(
    'force re-arms the first observed active state after initial %s',
    (initialState) => {
      const setFocused = vi.fn();
      const refreshActiveState = vi.fn();
      const observe = createAppStateObserver({ setFocused, refreshActiveState });

      observe(initialState);
      if (initialState !== 'active') observe('active');

      expect(refreshActiveState).toHaveBeenCalledTimes(1);
      expect(refreshActiveState).toHaveBeenLastCalledWith(true);
    },
  );

  it('uses normal reconciliation for later active transitions and tracks focus', () => {
    const setFocused = vi.fn();
    const refreshActiveState = vi.fn();
    const observe = createAppStateObserver({ setFocused, refreshActiveState });

    observe(null);
    observe('inactive');
    observe('active');
    observe('background');
    observe('active');

    expect(setFocused.mock.calls).toEqual([[false], [false], [true], [false], [true]]);
    expect(refreshActiveState.mock.calls).toEqual([[true], [false]]);
  });
});
