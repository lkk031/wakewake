import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ReminderRulesSchema, type RecurrenceRule, type ReminderRule } from '@wakewake/domain';

import { useAppTheme } from '@/theme/useAppTheme';

interface BaseProps {
  visible: boolean;
  onClose: () => void;
}

interface ReminderEditorProps extends BaseProps {
  value: ReminderRule[];
  onChange: (value: ReminderRule[]) => void;
}

export function TodoReminderEditor({ visible, value, onClose, onChange }: ReminderEditorProps) {
  const theme = useAppTheme();
  const [offsets, setOffsets] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setOffsets(value.map((rule) => rule.offsetMinutes).sort((a, b) => b - a));
      setText('');
      setError(null);
    }
  }, [value, visible]);

  function add(offset = Number(text)) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 525_600) {
      setError('请输入 0–525600 之间的整数分钟数');
      return;
    }
    if (offsets.includes(offset)) {
      setError('该提醒时间已存在');
      return;
    }
    if (offsets.length >= 10) {
      setError('最多设置 10 条提醒');
      return;
    }
    setOffsets((current) => [...current, offset].sort((a, b) => b - a));
    setText('');
    setError(null);
  }

  function save() {
    const ids = new Map(value.map((rule) => [rule.offsetMinutes, rule.id]));
    onChange(
      ReminderRulesSchema.parse(
        offsets.map((offsetMinutes) => ({
          id: ids.get(offsetMinutes) ?? Crypto.randomUUID(),
          offsetMinutes,
        })),
      ),
    );
    onClose();
  }

  return (
    <RuleModal visible={visible} title="事项提醒" onClose={onClose} onSave={save}>
      <View style={styles.inline}>
        <TextInput
          accessibilityLabel="提前分钟数"
          keyboardType="number-pad"
          value={text}
          onChangeText={setText}
          placeholder="提前分钟数"
          placeholderTextColor={theme.color.textMuted}
          style={[
            styles.input,
            {
              color: theme.color.text,
              backgroundColor: theme.color.background,
              borderColor: theme.color.border,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => add()}
          style={[styles.add, { backgroundColor: theme.color.accent }]}
        >
          <Text style={{ color: theme.isDark ? theme.color.background : theme.color.surface }}>
            添加
          </Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        {[
          [0, '到期时'],
          [10, '10 分钟'],
          [60, '1 小时'],
          [1_440, '1 天'],
          [10_080, '1 周'],
        ].map(([offset, label]) => {
          const minutes = Number(offset);
          const selected = offsets.includes(minutes);
          return (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() =>
                selected
                  ? setOffsets((current) => current.filter((item) => item !== minutes))
                  : add(minutes)
              }
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.color.accentSoft : theme.color.background,
                  borderColor: selected ? theme.color.accent : theme.color.border,
                },
              ]}
            >
              <Text style={{ color: selected ? theme.color.accentInk : theme.color.textSecondary }}>
                {String(label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {offsets.map((offset) => (
        <View key={offset} style={styles.ruleRow}>
          <Text style={{ color: theme.color.textSecondary }}>{formatOffset(offset)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOffsets((current) => current.filter((item) => item !== offset))}
          >
            <Text style={{ color: theme.color.critical, fontWeight: '700' }}>删除</Text>
          </Pressable>
        </View>
      ))}
      {offsets.length === 0 ? (
        <Text style={{ color: theme.color.textSecondary }}>此事项不会发送提醒。</Text>
      ) : null}
      {error ? <Text style={{ color: theme.color.critical }}>{error}</Text> : null}
    </RuleModal>
  );
}

interface RecurrenceEditorProps extends BaseProps {
  value: RecurrenceRule | null;
  anchorWeekday: number;
  locked: boolean;
  onChange: (value: RecurrenceRule | null) => void;
}

export function TodoRecurrenceEditor({
  visible,
  value,
  anchorWeekday,
  locked,
  onClose,
  onChange,
}: RecurrenceEditorProps) {
  const theme = useAppTheme();
  const [frequency, setFrequency] = useState<'none' | 'daily' | 'weekly'>('none');
  const [weekdays, setWeekdays] = useState<number[]>([anchorWeekday]);

  useEffect(() => {
    if (!visible) return;
    setFrequency(value?.frequency ?? 'none');
    setWeekdays(value?.frequency === 'weekly' ? value.weekdays : [anchorWeekday]);
  }, [anchorWeekday, value, visible]);

  function save() {
    const recurrence: RecurrenceRule | null =
      frequency === 'none'
        ? null
        : frequency === 'daily'
          ? { frequency: 'daily', interval: 1, end: { kind: 'never' } }
          : {
              frequency: 'weekly',
              interval: 1,
              end: { kind: 'never' },
              weekdays: weekdays.length > 0 ? weekdays : [anchorWeekday],
            };
    onChange(recurrence);
    onClose();
  }

  return (
    <RuleModal visible={visible} title="重复" onClose={onClose} onSave={save}>
      {locked ? (
        <Text style={{ color: theme.color.textSecondary }}>
          已有重复系列的频率和时间锚点已锁定。如需改变，请删除并重新创建。
        </Text>
      ) : (
        <>
          <View style={styles.chips}>
            {[
              ['none', '不重复'],
              ['daily', '每天'],
              ['weekly', '每周'],
            ].map(([kind, label]) => {
              const selected = frequency === kind;
              return (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFrequency(kind as typeof frequency)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.color.accentSoft : theme.color.background,
                      borderColor: selected ? theme.color.accent : theme.color.border,
                    },
                  ]}
                >
                  <Text
                    style={{ color: selected ? theme.color.accentInk : theme.color.textSecondary }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {frequency === 'weekly' ? (
            <View style={styles.chips}>
              {['日', '一', '二', '三', '四', '五', '六'].map((label, weekday) => {
                const selected = weekdays.includes(weekday);
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`星期${label}`}
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setWeekdays((current) =>
                        selected
                          ? current.filter((item) => item !== weekday)
                          : [...current, weekday].sort((a, b) => a - b),
                      )
                    }
                    style={[
                      styles.weekday,
                      {
                        backgroundColor: selected ? theme.color.accent : theme.color.background,
                        borderColor: selected ? theme.color.accent : theme.color.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected
                          ? theme.isDark
                            ? theme.color.background
                            : theme.color.surface
                          : theme.color.textSecondary,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </RuleModal>
  );
}

function RuleModal({
  visible,
  title,
  children,
  onClose,
  onSave,
}: BaseProps & { title: string; children: React.ReactNode; onSave: () => void }) {
  const theme = useAppTheme();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.color.surface }]}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={{ color: theme.color.textSecondary, fontWeight: '700' }}>取消</Text>
            </Pressable>
            <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onSave}>
              <Text style={{ color: theme.color.accent, fontWeight: '700' }}>完成</Text>
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

function formatOffset(offset: number): string {
  if (offset === 0) return '到期时';
  if (offset % 10_080 === 0) return `提前 ${offset / 10_080} 周`;
  if (offset % 1_440 === 0) return `提前 ${offset / 1_440} 天`;
  if (offset % 60 === 0) return `提前 ${offset / 60} 小时`;
  return `提前 ${offset} 分钟`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  title: { fontSize: 17, fontWeight: '700' },
  content: { padding: 20, gap: 16 },
  inline: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  add: { borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  weekday: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
