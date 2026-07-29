import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ randomUUID: vi.fn() }));
vi.mock('expo-router', () => ({ router: { back: vi.fn() } }));
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: vi.fn() }));
vi.mock('@/query/notificationQueries', () => ({
  useNotificationPermission: vi.fn(),
  useRequestNotificationPermission: vi.fn(),
}));
vi.mock('@/query/todoQueries', () => ({ useCreateTodo: vi.fn() }));
vi.mock('@/query/settingsQueries', () => ({
  useDefaultReminders: vi.fn(),
  useSettings: vi.fn(),
  useTodoTemplates: vi.fn(),
}));
vi.mock('@/theme/useAppTheme', () => ({ useAppTheme: vi.fn() }));
vi.mock('../TodoForm', () => ({ TodoForm: vi.fn() }));
vi.mock('../todoForm', () => ({
  createTodoFormDefaults: vi.fn(),
  mapTodoForm: vi.fn(),
}));

import type { NotificationPermissionState } from '@/services/notifications/nativeAdapter';
import {
  completeQuickCreate,
  QUICK_CREATE_PERMISSION_READ_ERROR_MESSAGE,
  QUICK_CREATE_PERMISSION_READ_ERROR_TITLE,
} from '../QuickCreateScreen';

const grantedPermission: NotificationPermissionState = {
  status: 'granted',
  granted: true,
  canAskAgain: true,
  channelState: 'enabled',
};

const undeterminedPermission: NotificationPermissionState = {
  status: 'undetermined',
  granted: false,
  canAskAgain: true,
  channelState: 'enabled',
};

function createOptions(
  overrides: Partial<Parameters<typeof completeQuickCreate>[0]> = {},
): Parameters<typeof completeQuickCreate>[0] {
  return {
    hasReminders: true,
    permission: grantedPermission,
    refetchPermission: vi.fn(async () => grantedPermission),
    requestPermission: vi.fn(async () => grantedPermission),
    promptForPermission: vi.fn(),
    showPermissionReadError: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

describe('Quick Create notification permission flow', () => {
  it('bypasses notification permission work when the saved todo has no reminders', async () => {
    const options = createOptions({ hasReminders: false, permission: undefined });

    await completeQuickCreate(options);

    expect(options.refetchPermission).not.toHaveBeenCalled();
    expect(options.requestPermission).not.toHaveBeenCalled();
    expect(options.promptForPermission).not.toHaveBeenCalled();
    expect(options.close).toHaveBeenCalledTimes(1);
  });

  it('refetches an unresolved permission and prompts only when it can still ask', async () => {
    const refetchPermission = vi.fn(async () => undeterminedPermission);
    let actions: { dismiss: () => void; enable: () => Promise<void> } | undefined;
    const options = createOptions({
      permission: undefined,
      refetchPermission,
      promptForPermission: (nextActions) => {
        actions = nextActions;
      },
    });

    await completeQuickCreate(options);

    expect(refetchPermission).toHaveBeenCalledTimes(1);
    expect(actions).toBeDefined();
    expect(options.close).not.toHaveBeenCalled();
  });

  it.each<NotificationPermissionState>([
    { status: 'granted', granted: true, canAskAgain: true, channelState: 'enabled' },
    { status: 'denied', granted: false, canAskAgain: true, channelState: 'enabled' },
    { status: 'denied', granted: false, canAskAgain: false, channelState: 'enabled' },
    { status: 'undetermined', granted: false, canAskAgain: false, channelState: 'enabled' },
    { status: 'unsupported', granted: false, canAskAgain: false, channelState: 'not-applicable' },
  ])(
    'does not prompt for permission state $status with canAskAgain=$canAskAgain',
    async (state) => {
      const options = createOptions({ permission: state });

      await completeQuickCreate(options);

      expect(options.promptForPermission).not.toHaveBeenCalled();
      expect(options.requestPermission).not.toHaveBeenCalled();
      expect(options.close).toHaveBeenCalledTimes(1);
    },
  );

  it('awaits the permission request and post-grant reconciliation before closing', async () => {
    let finishRequest!: () => void;
    const requestPermission = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRequest = resolve;
        }),
    );
    let enable!: () => Promise<void>;
    const options = createOptions({
      permission: undeterminedPermission,
      requestPermission,
      promptForPermission: (actions) => {
        enable = actions.enable;
      },
    });

    await completeQuickCreate(options);
    const enabling = enable();
    await Promise.resolve();
    expect(options.close).not.toHaveBeenCalled();

    finishRequest();
    await enabling;
    expect(options.close).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved todo and shows recovery guidance when permission refetch fails', async () => {
    const options = createOptions({
      permission: undefined,
      refetchPermission: vi.fn(async () => {
        throw new Error('permission read failed');
      }),
    });

    await expect(completeQuickCreate(options)).resolves.toBeUndefined();

    expect(options.showPermissionReadError).toHaveBeenCalledTimes(1);
    expect(options.requestPermission).not.toHaveBeenCalled();
    expect(options.close).toHaveBeenCalledTimes(1);
    expect(QUICK_CREATE_PERMISSION_READ_ERROR_TITLE).toBe('事项已保存');
    expect(QUICK_CREATE_PERMISSION_READ_ERROR_MESSAGE).toContain('开启通知');
    expect(QUICK_CREATE_PERMISSION_READ_ERROR_MESSAGE).toContain('提醒同步');
  });
});
