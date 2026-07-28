import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useExportBackup, usePickBackup, useReplaceBackup } from '@/query/backupQueries';
import {
  useNotificationPermission,
  useRequestNotificationPermission,
  useTestNotification,
} from '@/query/notificationQueries';
import {
  useDefaultReminders,
  useSetDefaultReminders,
  useSettings,
  useUpdateSettings,
} from '@/query/settingsQueries';
import { useAppTheme } from '@/theme/useAppTheme';
import { DurationEditor, ReminderEditor, ThemeEditor, TimezoneEditor } from './SettingsEditors';

interface SettingsRow {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  value: string;
  onPress?: (() => void | Promise<void>) | undefined;
}

interface SettingsSection {
  title: string;
  rows: SettingsRow[];
}

export function SettingsScreen() {
  const theme = useAppTheme();
  const [editor, setEditor] = useState<'theme' | 'reminders' | 'timezone' | 'duration' | null>(
    null,
  );
  const settings = useSettings();
  const reminders = useDefaultReminders();
  const updateSettings = useUpdateSettings();
  const setDefaultReminders = useSetDefaultReminders();
  const permission = useNotificationPermission();
  const requestPermission = useRequestNotificationPermission();
  const testNotification = useTestNotification();
  const exportBackup = useExportBackup();
  const pickBackup = usePickBackup();
  const replaceBackup = useReplaceBackup();
  const permissionState = permission.data;

  async function enableNotifications() {
    if (permissionState?.status === 'denied' && !permissionState.canAskAgain) {
      await Linking.openSettings();
      return;
    }
    const next = await requestPermission.mutateAsync();
    if (!next.granted && !next.canAskAgain) {
      Alert.alert('通知未开启', '请在 Android 系统设置中允许 WakeWake 发送通知。', [
        { text: '取消', style: 'cancel' },
        { text: '打开设置', onPress: () => void Linking.openSettings() },
      ]);
    }
  }

  async function sendTestNotification() {
    try {
      await testNotification.mutateAsync();
      Alert.alert('测试提醒已安排', '约 10 秒后会收到一条本地通知。');
    } catch {
      Alert.alert('无法安排测试提醒', '请先开启通知权限。');
    }
  }

  async function shareBackup() {
    try {
      await exportBackup.mutateAsync();
    } catch (error) {
      Alert.alert('导出失败', errorMessage(error));
    }
  }

  async function chooseBackup() {
    try {
      const picked = await pickBackup.mutateAsync();
      if (picked === null) return;
      const exportedAt = picked.backup.exportedAt.toLocaleString('zh-CN');
      Alert.alert(
        '替换当前数据？',
        `${picked.name}\n导出时间：${exportedAt}\n事项：${picked.backup.todos.length} 项\n重复实例状态：${picked.backup.occurrenceStates.length} 项\n\n导入前会自动保存恢复副本，然后替换当前本地数据。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '替换数据',
            style: 'destructive',
            onPress: () =>
              void replaceBackup
                .mutateAsync(picked.backup)
                .then((recoveryUri) =>
                  Alert.alert('导入完成', `当前数据已替换。恢复副本保存在：\n${recoveryUri}`),
                )
                .catch((error) => Alert.alert('导入失败', errorMessage(error))),
          },
        ],
      );
    } catch (error) {
      Alert.alert('无法读取备份', errorMessage(error));
    }
  }

  const sections: SettingsSection[] = [
    {
      title: '外观',
      rows: [
        {
          icon: 'contrast-outline' as const,
          title: '主题',
          value: settings.data ? themeModeLabel(settings.data.themeMode) : '读取中',
          onPress: settings.data ? () => setEditor('theme') : undefined,
        },
      ],
    },
    {
      title: '时间与提醒',
      rows: [
        {
          icon: 'notifications-outline' as const,
          title: '默认提醒',
          value: remindersLabel(reminders.data?.map((rule) => rule.offsetMinutes) ?? []),
          onPress: settings.data && reminders.data ? () => setEditor('reminders') : undefined,
        },
        {
          icon: 'time-outline' as const,
          title: '时区',
          value: settings.data
            ? `${settings.data.timezoneMode === 'system' ? '跟随系统' : '固定'} · ${settings.data.timezone}`
            : '读取中',
          onPress: settings.data ? () => setEditor('timezone') : undefined,
        },
        {
          icon: 'hourglass-outline' as const,
          title: '默认时长',
          value: settings.data ? `${settings.data.defaultDurationMinutes} 分钟` : '读取中',
          onPress: settings.data ? () => setEditor('duration') : undefined,
        },
      ],
    },
    {
      title: '通知',
      rows: [
        {
          icon: 'shield-checkmark-outline' as const,
          title: '通知权限',
          value: permissionLabel(permissionState?.status),
          onPress: enableNotifications,
        },
        {
          icon: 'alarm-outline' as const,
          title: '发送测试提醒',
          value: permissionState?.granted ? '10 秒后送达' : '开启权限后可用',
          onPress: permissionState?.granted ? sendTestNotification : enableNotifications,
        },
        {
          icon: 'eye-off-outline' as const,
          title: '通知内容',
          value: '默认隐藏事项标题和备注',
        },
      ],
    },
    {
      title: '个人本地版',
      rows: [
        {
          icon: 'phone-portrait-outline' as const,
          title: '数据存储',
          value: '仅保存在当前设备，不含账号和云同步',
        },
        {
          icon: 'share-outline' as const,
          title: '导出 JSON 备份',
          value: exportBackup.isPending ? '正在准备…' : '通过系统分享保存完整数据',
          onPress: shareBackup,
        },
        {
          icon: 'download-outline' as const,
          title: '从 JSON 恢复',
          value:
            pickBackup.isPending || replaceBackup.isPending ? '处理中…' : '校验后替换当前本地数据',
          onPress: chooseBackup,
        },
      ],
    },
  ];

  return (
    <Screen eyebrow="PREFERENCES" title="设置" subtitle="调整外观、时间和提醒方式。">
      {settings.data && reminders.data ? (
        <>
          <ThemeEditor
            visible={editor === 'theme'}
            value={settings.data.themeMode}
            saving={updateSettings.isPending}
            onClose={() => setEditor(null)}
            onSave={async (value) => {
              try {
                await updateSettings.mutateAsync({ ...settings.data, themeMode: value });
                setEditor(null);
              } catch (error) {
                Alert.alert('保存失败', errorMessage(error));
              }
            }}
          />
          <ReminderEditor
            visible={editor === 'reminders'}
            value={reminders.data}
            saving={setDefaultReminders.isPending}
            onClose={() => setEditor(null)}
            onSave={async (value) => {
              try {
                await setDefaultReminders.mutateAsync(value);
                setEditor(null);
              } catch (error) {
                Alert.alert('保存失败', errorMessage(error));
              }
            }}
          />
          <TimezoneEditor
            visible={editor === 'timezone'}
            value={settings.data}
            saving={updateSettings.isPending}
            onClose={() => setEditor(null)}
            onSave={async (value) => {
              try {
                await updateSettings.mutateAsync(value);
                setEditor(null);
              } catch (error) {
                Alert.alert('保存失败', errorMessage(error));
              }
            }}
          />
          <DurationEditor
            visible={editor === 'duration'}
            value={settings.data.defaultDurationMinutes}
            saving={updateSettings.isPending}
            onClose={() => setEditor(null)}
            onSave={async (value) => {
              try {
                await updateSettings.mutateAsync({
                  ...settings.data,
                  defaultDurationMinutes: value,
                });
                setEditor(null);
              } catch (error) {
                Alert.alert('保存失败', errorMessage(error));
              }
            }}
          />
        </>
      ) : null}
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.color.textSecondary }]}>
            {section.title}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.color.surface, borderColor: theme.color.border },
            ]}
          >
            {section.rows.map((row, index) => {
              const content = (
                <>
                  <View style={[styles.icon, { backgroundColor: theme.color.accentSoft }]}>
                    <Ionicons name={row.icon} size={18} color={theme.color.accent} />
                  </View>
                  <View style={styles.copy}>
                    <Text style={[styles.title, { color: theme.color.text }]}>{row.title}</Text>
                    <Text style={[styles.value, { color: theme.color.textSecondary }]}>
                      {row.value}
                    </Text>
                  </View>
                  {row.onPress ? (
                    <Ionicons name="chevron-forward" size={17} color={theme.color.textMuted} />
                  ) : null}
                </>
              );
              const style = [
                styles.row,
                index > 0 && {
                  borderTopColor: theme.color.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ];
              return row.onPress ? (
                <Pressable
                  key={row.title}
                  accessibilityRole="button"
                  onPress={row.onPress}
                  style={style}
                >
                  {content}
                </Pressable>
              ) : (
                <View key={row.title} style={style}>
                  {content}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </Screen>
  );
}

function themeModeLabel(mode: 'system' | 'light' | 'dark'): string {
  return { system: '跟随系统', light: '浅色', dark: '深色' }[mode];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}

function permissionLabel(status?: string): string {
  return (
    {
      granted: '已允许',
      denied: '已拒绝 · 点击打开',
      undetermined: '尚未请求 · 点击开启',
      unsupported: '当前平台不支持',
    }[status ?? ''] ?? '读取中'
  );
}

function remindersLabel(offsets: number[]): string {
  if (offsets.length === 0) return '不提醒';
  return offsets
    .slice()
    .sort((a, b) => b - a)
    .map((offset) => {
      if (offset % 1_440 === 0) return `${offset / 1_440} 天`;
      if (offset % 60 === 0) return `${offset / 60} 小时`;
      return `${offset} 分钟`;
    })
    .join('、');
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 9,
    marginLeft: 4,
  },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  value: { fontSize: 12, marginTop: 4 },
});
