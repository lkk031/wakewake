import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BackupSettingsSchema,
  DEFAULT_REMINDER_OFFSETS,
  IanaTimezoneSchema,
  ReminderRulesSchema,
  type BackupSettings,
  type ReminderAnchor,
  type ReminderRule,
  type ThemeMode,
} from '@wakewake/domain';

import { getDeviceTimezone } from '@/services/localization/deviceTimezone';
import type { AppTheme } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';

interface EditorProps {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
}

interface ThemeEditorProps extends EditorProps {
  value: ThemeMode;
  onSave: (value: ThemeMode) => Promise<void>;
}

export function ThemeEditor({ visible, value, saving, onClose, onSave }: ThemeEditorProps) {
  const [selected, setSelected] = useState<ThemeMode>(value);

  useEffect(() => {
    if (visible) setSelected(value);
  }, [value, visible]);

  return (
    <EditorModal
      visible={visible}
      title="主题"
      saving={saving}
      onClose={onClose}
      onSave={() => onSave(selected)}
    >
      <View style={styles.chips}>
        {(['system', 'light', 'dark'] as const).map((mode) => (
          <ChoiceChip
            key={mode}
            label={themeModeLabel(mode)}
            selected={selected === mode}
            onPress={() => setSelected(mode)}
          />
        ))}
      </View>
      <HelpText>跟随系统会随设备外观变化；浅色和深色会固定 WakeWake 的外观。</HelpText>
    </EditorModal>
  );
}

interface DurationEditorProps extends EditorProps {
  value: number;
  onSave: (value: number) => Promise<void>;
}

export function DurationEditor({ visible, value, saving, onClose, onSave }: DurationEditorProps) {
  const theme = useAppTheme();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setText(String(value));
      setError(null);
    }
  }, [value, visible]);

  async function save() {
    const duration = Number(text);
    if (!Number.isInteger(duration) || duration < 1 || duration > 1_440) {
      setError('请输入 1–1440 之间的整数分钟数');
      return;
    }
    await onSave(duration);
  }

  return (
    <EditorModal visible={visible} title="默认时长" saving={saving} onClose={onClose} onSave={save}>
      <TextInput
        accessibilityLabel="默认时长（分钟）"
        keyboardType="number-pad"
        value={text}
        onChangeText={setText}
        placeholder="分钟"
        style={inputStyle(theme)}
      />
      <View style={styles.chips}>
        {[15, 30, 45, 60, 90, 120].map((minutes) => (
          <ChoiceChip
            key={minutes}
            label={`${minutes} 分钟`}
            selected={text === String(minutes)}
            onPress={() => setText(String(minutes))}
          />
        ))}
      </View>
      <FieldError message={error} />
      <HelpText>只影响之后创建的定时事项。</HelpText>
    </EditorModal>
  );
}

interface ReminderEditorProps extends EditorProps {
  value: ReminderRule[];
  onSave: (value: ReminderRule[]) => Promise<void>;
}

export function ReminderEditor({ visible, value, saving, onClose, onSave }: ReminderEditorProps) {
  const theme = useAppTheme();
  const [drafts, setDrafts] = useState<Pick<ReminderRule, 'anchor' | 'offsetMinutes'>[]>([]);
  const [anchor, setAnchor] = useState<ReminderAnchor>('due');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDrafts(
        value.map(({ anchor: ruleAnchor, offsetMinutes }) => ({
          anchor: ruleAnchor,
          offsetMinutes,
        })),
      );
      setAnchor('due');
      setText('');
      setError(null);
    }
  }, [value, visible]);

  function hasRule(ruleAnchor: ReminderAnchor, offsetMinutes: number): boolean {
    return drafts.some(
      (rule) => rule.anchor === ruleAnchor && rule.offsetMinutes === offsetMinutes,
    );
  }

  function removeRule(ruleAnchor: ReminderAnchor, offsetMinutes: number) {
    setDrafts((current) =>
      current.filter((rule) => rule.anchor !== ruleAnchor || rule.offsetMinutes !== offsetMinutes),
    );
  }

  function addOffset(offsetValue = Number(text), ruleAnchor = anchor) {
    if (!Number.isInteger(offsetValue) || offsetValue < 0 || offsetValue > 525_600) {
      setError('请输入 0–525600 之间的整数分钟数');
      return;
    }
    if (hasRule(ruleAnchor, offsetValue)) {
      setError(`该${anchorLabel(ruleAnchor)}提醒时间已存在`);
      return;
    }
    if (drafts.length >= 10) {
      setError('最多设置 10 条默认提醒');
      return;
    }
    setDrafts((current) => [...current, { anchor: ruleAnchor, offsetMinutes: offsetValue }]);
    setText('');
    setError(null);
  }

  async function save() {
    const existingIds = new Map(
      value.map((rule) => [reminderKey(rule.anchor, rule.offsetMinutes), rule.id]),
    );
    const rules = ReminderRulesSchema.parse(
      drafts.map((rule) => ({
        ...rule,
        id: existingIds.get(reminderKey(rule.anchor, rule.offsetMinutes)) ?? Crypto.randomUUID(),
      })),
    );
    await onSave(rules);
  }

  return (
    <EditorModal visible={visible} title="默认提醒" saving={saving} onClose={onClose} onSave={save}>
      <View style={styles.chips}>
        {(['start', 'due'] as const).map((item) => (
          <ChoiceChip
            key={item}
            label={`${anchorLabel(item)}提醒`}
            selected={anchor === item}
            onPress={() => setAnchor(item)}
          />
        ))}
      </View>
      <View style={styles.inlineInput}>
        <TextInput
          accessibilityLabel={`${anchorLabel(anchor)}前分钟数`}
          keyboardType="number-pad"
          value={text}
          onChangeText={setText}
          placeholder={`${anchorLabel(anchor)}前分钟数（0 表示准时）`}
          style={[inputStyle(theme), styles.flex]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => addOffset()}
          style={[styles.addButton, { backgroundColor: theme.color.accent }]}
        >
          <Text
            style={[
              styles.addText,
              { color: theme.isDark ? theme.color.background : theme.color.surface },
            ]}
          >
            添加
          </Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        {[0, 10, 60, 1_440, 10_080].map((offset) => (
          <ChoiceChip
            key={`${anchor}:${offset}`}
            label={formatOffset(offset, anchor, false)}
            selected={hasRule(anchor, offset)}
            onPress={() =>
              hasRule(anchor, offset) ? removeRule(anchor, offset) : addOffset(offset, anchor)
            }
          />
        ))}
      </View>
      {drafts.length === 0 ? <HelpText>新事项默认不提醒。</HelpText> : null}
      {(['start', 'due'] as const).map((ruleAnchor) =>
        drafts
          .filter((rule) => rule.anchor === ruleAnchor)
          .sort((a, b) => b.offsetMinutes - a.offsetMinutes)
          .map((rule) => (
            <View key={reminderKey(rule.anchor, rule.offsetMinutes)} style={styles.reminderRow}>
              <HelpText>{formatOffset(rule.offsetMinutes, rule.anchor, true)}</HelpText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`删除${formatOffset(rule.offsetMinutes, rule.anchor, true)}`}
                onPress={() => removeRule(rule.anchor, rule.offsetMinutes)}
              >
                <Text style={[styles.remove, { color: theme.color.critical }]}>删除</Text>
              </Pressable>
            </View>
          )),
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          setDrafts(
            DEFAULT_REMINDER_OFFSETS.map((offsetMinutes) => ({
              anchor: 'due',
              offsetMinutes,
            })),
          )
        }
      >
        <Text style={[styles.link, { color: theme.color.accent }]}>
          恢复推荐值（截止前 1 天、1 小时、10 分钟）
        </Text>
      </Pressable>
      <FieldError message={error} />
      <HelpText>
        只影响之后创建的事项；开始与截止提醒合计最多 10 条，全天事项会统一使用开始日 09:00。
      </HelpText>
    </EditorModal>
  );
}

interface TimezoneEditorProps extends EditorProps {
  value: BackupSettings;
  onSave: (value: BackupSettings) => Promise<void>;
}

export function TimezoneEditor({ visible, value, saving, onClose, onSave }: TimezoneEditorProps) {
  const theme = useAppTheme();
  const [system, setSystem] = useState(value.timezoneMode === 'system');
  const [timezone, setTimezone] = useState(value.timezone);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSystem(value.timezoneMode === 'system');
      setTimezone(value.timezone);
      setError(null);
    }
  }, [value, visible]);

  async function save() {
    const nextTimezone = system ? getDeviceTimezone() : timezone.trim();
    const result = IanaTimezoneSchema.safeParse(nextTimezone);
    if (!result.success) {
      setError('请输入有效的 IANA 时区，例如 Asia/Shanghai');
      return;
    }
    await onSave(
      BackupSettingsSchema.parse({
        ...value,
        timezoneMode: system ? 'system' : 'fixed',
        timezone: result.data,
      }),
    );
  }

  return (
    <EditorModal visible={visible} title="时区" saving={saving} onClose={onClose} onSave={save}>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Label>跟随系统时区</Label>
          <HelpText>系统时区变化后，回到应用时自动更新。</HelpText>
        </View>
        <Switch value={system} onValueChange={setSystem} />
      </View>
      {system ? (
        <HelpText>当前设备：{getDeviceTimezone()}</HelpText>
      ) : (
        <TextInput
          accessibilityLabel="固定 IANA 时区"
          autoCapitalize="none"
          autoCorrect={false}
          value={timezone}
          onChangeText={setTimezone}
          placeholder="Asia/Shanghai"
          style={inputStyle(theme)}
        />
      )}
      <FieldError message={error} />
      <HelpText>已有定时事项的绝对时刻不变；已有重复系列继续使用创建时的时区。</HelpText>
    </EditorModal>
  );
}

interface EditorModalProps extends EditorProps {
  title: string;
  children: React.ReactNode;
  onSave: () => Promise<void>;
}

function EditorModal({ visible, title, saving, children, onClose, onSave }: EditorModalProps) {
  const theme = useAppTheme();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.color.surface }]}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={onClose}>
              <Text style={[styles.action, { color: theme.color.textSecondary }]}>取消</Text>
            </Pressable>
            <Text style={[styles.heading, { color: theme.color.text }]}>{title}</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void onSave()}>
              <Text style={[styles.action, { color: theme.color.accent }]}>
                {saving ? '保存中' : '保存'}
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.color.accentSoft : theme.color.background,
          borderColor: selected ? theme.color.accent : theme.color.border,
        },
      ]}
    >
      <Text style={{ color: selected ? theme.color.accentInk : theme.color.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  return <Text style={[styles.label, { color: theme.color.text }]}>{children}</Text>;
}

function HelpText({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  return <Text style={[styles.help, { color: theme.color.textSecondary }]}>{children}</Text>;
}

function FieldError({ message }: { message: string | null }) {
  const theme = useAppTheme();
  return message ? (
    <Text style={[styles.error, { color: theme.color.critical }]}>{message}</Text>
  ) : null;
}

function inputStyle(theme: AppTheme) {
  return [
    styles.input,
    {
      color: theme.color.text,
      backgroundColor: theme.color.background,
      borderColor: theme.color.border,
    },
  ];
}

function themeModeLabel(mode: ThemeMode): string {
  return { system: '跟随系统', light: '浅色', dark: '深色' }[mode];
}

function reminderKey(anchor: ReminderAnchor, offsetMinutes: number): string {
  return `${anchor}:${offsetMinutes}`;
}

function anchorLabel(anchor: ReminderAnchor): string {
  return anchor === 'start' ? '开始' : '截止';
}

function formatOffset(offset: number, anchor: ReminderAnchor, contextual: boolean): string {
  if (offset === 0) return contextual ? `${anchorLabel(anchor)}时` : '准时';
  const prefix = contextual ? `${anchorLabel(anchor)}前 ` : '';
  if (offset % 10_080 === 0) return `${prefix}${offset / 10_080} 周`;
  if (offset % 1_440 === 0) return `${prefix}${offset / 1_440} 天`;
  if (offset % 60 === 0) return `${prefix}${offset / 60} 小时`;
  return `${prefix}${offset} 分钟`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  heading: { fontSize: 17, fontWeight: '700' },
  action: { minWidth: 56, fontSize: 15, fontWeight: '700' },
  content: { padding: 20, gap: 16 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
  inlineInput: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  addButton: { height: 52, borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' },
  addText: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  reminderRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  label: { fontSize: 15, fontWeight: '700' },
  help: { fontSize: 13, lineHeight: 19 },
  error: { fontSize: 13, fontWeight: '600' },
  remove: { fontSize: 14, fontWeight: '700', padding: 8 },
  link: { fontSize: 14, fontWeight: '700', paddingVertical: 6 },
});
