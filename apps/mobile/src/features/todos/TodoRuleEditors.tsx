import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ReminderRulesSchema,
  type RecurrenceRule,
  type ReminderAnchor,
  type ReminderRule,
} from '@wakewake/domain';

import { useAppTheme } from '@/theme/useAppTheme';

interface BaseProps {
  visible: boolean;
  onClose: () => void;
}

interface ReminderEditorProps extends BaseProps {
  value: ReminderRule[];
  timingKind: 'timed' | 'allDay';
  onChange: (value: ReminderRule[]) => void;
}

interface ReminderDraft {
  anchor: ReminderAnchor;
  offsetMinutes: number;
}

const REMINDER_PRESETS = [0, 10, 60, 1_440, 10_080] as const;

function reminderDraftKey(rule: Pick<ReminderDraft, 'anchor' | 'offsetMinutes'>): string {
  return `${rule.anchor}:${rule.offsetMinutes}`;
}

export function TodoReminderEditor({
  visible,
  value,
  timingKind,
  onClose,
  onChange,
}: ReminderEditorProps) {
  const theme = useAppTheme();
  const [drafts, setDrafts] = useState<ReminderDraft[]>([]);
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
      setAnchor(timingKind === 'allDay' ? 'start' : 'due');
      setText('');
      setError(null);
    }
  }, [timingKind, value, visible]);

  function hasRule(ruleAnchor: ReminderAnchor, offsetMinutes: number): boolean {
    return drafts.some(
      (rule) => rule.anchor === ruleAnchor && rule.offsetMinutes === offsetMinutes,
    );
  }

  function remove(ruleAnchor: ReminderAnchor, offsetMinutes: number) {
    setDrafts((current) =>
      current.filter((rule) => rule.anchor !== ruleAnchor || rule.offsetMinutes !== offsetMinutes),
    );
  }

  function add(offsetMinutes = Number(text), ruleAnchor = anchor) {
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > 525_600) {
      setError('请输入 0–525600 之间的整数分钟数');
      return;
    }
    if (hasRule(ruleAnchor, offsetMinutes)) {
      setError(`该${anchorLabel(ruleAnchor)}提醒时间已存在`);
      return;
    }
    if (drafts.length >= 10) {
      setError('最多设置 10 条提醒');
      return;
    }
    setDrafts((current) => [...current, { anchor: ruleAnchor, offsetMinutes }]);
    setText('');
    setError(null);
  }

  function save() {
    const ids = new Map(value.map((rule) => [reminderDraftKey(rule), rule.id]));
    onChange(
      ReminderRulesSchema.parse(
        drafts.map((rule) => ({
          ...rule,
          id: ids.get(reminderDraftKey(rule)) ?? Crypto.randomUUID(),
        })),
      ),
    );
    onClose();
  }

  const anchors: ReminderAnchor[] = timingKind === 'allDay' ? ['start'] : ['start', 'due'];

  return (
    <RuleModal visible={visible} title="事项提醒" onClose={onClose} onSave={save}>
      {timingKind === 'allDay' ? (
        <Text style={{ color: theme.color.textSecondary }}>
          全天事项以开始日 09:00 为提醒基准。
        </Text>
      ) : (
        <>
          <Text style={{ color: theme.color.textSecondary, lineHeight: 20 }}>
            开始提醒随开始时间变化；截止提醒只随截止时间变化。日历列表显示的是开始时间。
          </Text>
          <View style={styles.chips}>
            {anchors.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: anchor === item }}
                onPress={() => setAnchor(item)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      anchor === item ? theme.color.accentSoft : theme.color.background,
                    borderColor: anchor === item ? theme.color.accent : theme.color.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: anchor === item ? theme.color.accentInk : theme.color.textSecondary,
                  }}
                >
                  {anchorLabel(item)}提醒
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <View style={styles.inline}>
        <TextInput
          accessibilityLabel={`${anchorLabel(anchor)}前分钟数`}
          keyboardType="number-pad"
          value={text}
          onChangeText={setText}
          placeholder={`${anchorLabel(anchor)}前分钟数`}
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
        {REMINDER_PRESETS.map((offsetMinutes) => {
          const selected = hasRule(anchor, offsetMinutes);
          return (
            <Pressable
              key={`${anchor}:${offsetMinutes}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() =>
                selected ? remove(anchor, offsetMinutes) : add(offsetMinutes, anchor)
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
                {formatOffset(offsetMinutes, anchor, false)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {anchors.map((ruleAnchor) => {
        const rules = drafts
          .filter((rule) => rule.anchor === ruleAnchor)
          .sort((a, b) => b.offsetMinutes - a.offsetMinutes);
        if (rules.length === 0) return null;
        return (
          <View key={ruleAnchor} style={styles.ruleGroup}>
            <Text style={[styles.groupTitle, { color: theme.color.text }]}>
              {timingKind === 'allDay' ? '开始日 09:00' : `${anchorLabel(ruleAnchor)}提醒`}
            </Text>
            {rules.map((rule) => (
              <View key={reminderDraftKey(rule)} style={styles.ruleRow}>
                <Text style={{ color: theme.color.textSecondary }}>
                  {formatOffset(rule.offsetMinutes, ruleAnchor, true)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除${formatOffset(rule.offsetMinutes, ruleAnchor, true)}`}
                  onPress={() => remove(ruleAnchor, rule.offsetMinutes)}
                >
                  <Text style={{ color: theme.color.critical, fontWeight: '700' }}>删除</Text>
                </Pressable>
              </View>
            ))}
          </View>
        );
      })}
      {drafts.length === 0 ? (
        <Text style={{ color: theme.color.textSecondary }}>此事项不会发送提醒。</Text>
      ) : null}
      <Text style={{ color: theme.color.textMuted, fontSize: 12 }}>
        已经过提醒时刻的规则不会补发；开始与截止提醒合计最多 10 条。
      </Text>
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
  ruleGroup: { gap: 6 },
  groupTitle: { fontSize: 14, fontWeight: '700' },
  ruleRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
