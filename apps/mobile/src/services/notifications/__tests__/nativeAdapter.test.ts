import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('expo');
  vi.doUnmock('expo-notifications');
  vi.doUnmock('react-native');
  vi.resetModules();
});

describe('Expo notification adapter runtime support', () => {
  it('does not evaluate expo-notifications in Android Expo Go', async () => {
    vi.doMock('expo', () => ({ isRunningInExpoGo: () => true }));
    vi.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    vi.doMock('expo-notifications', () => {
      throw new Error('expo-notifications must not load in Expo Go');
    });

    const { ExpoNotificationAdapter } = await import('../nativeAdapter');
    const adapter = new ExpoNotificationAdapter();

    expect(adapter.supported).toBe(false);
    await expect(adapter.getPermissionState()).resolves.toEqual({
      status: 'unsupported',
      granted: false,
      canAskAgain: false,
      channelState: 'not-applicable',
    });
    await expect(adapter.requestPermission()).resolves.toEqual({
      status: 'unsupported',
      granted: false,
      canAskAgain: false,
      channelState: 'not-applicable',
    });
    await expect(adapter.ensureChannel()).resolves.toBeUndefined();
    await expect(adapter.listScheduled()).resolves.toEqual([]);
    await expect(adapter.cancel('native-id')).resolves.toBeUndefined();
    await expect(adapter.scheduleTest(new Date())).rejects.toThrow(
      'Notifications are unavailable in this runtime',
    );
  });

  it('does not evaluate expo-notifications on web', async () => {
    vi.doMock('expo', () => ({ isRunningInExpoGo: () => false }));
    vi.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    vi.doMock('expo-notifications', () => {
      throw new Error('expo-notifications must not load on web');
    });

    const { ExpoNotificationAdapter } = await import('../nativeAdapter');

    expect(new ExpoNotificationAdapter().supported).toBe(false);
  });
});
