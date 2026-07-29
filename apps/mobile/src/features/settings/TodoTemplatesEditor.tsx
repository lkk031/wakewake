import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MAX_TODO_TEMPLATES,
  TodoTemplateSchema,
  type ReminderRule,
  type TodoTemplate,
} from '@wakewake/domain';

import { TodoReminderEditor } from '@/features/todos/TodoRuleEditors';
import { useAppTheme } from '@/theme/useAppTheme';

interface TodoTemplatesEditorProps {
  visible: boolean;
  templates: readonly TodoTemplate[];
  saving: boolean;
  onClose: () => void;
  onCreate: (template: TodoTemplate) => Promise<void>;
  onUpdate: (template: TodoTemplate) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (orderedIds: readonly string[]) => Promise<void>;
}

interface TemplateDraft {
  id: string;
  name: string;
  durationText: string;
  reminders: ReminderRule[];
  isNew: boolean;
}

export function TodoTemplatesEditor({
  visible,
  templates,
  saving,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: TodoTemplatesEditorProps) {
  const theme = useAppTheme();
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [editingReminders, setEditingReminders] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setDraft(null);
      setEditingReminders(false);
      setError(null);
    }
  }, [visible]);

  function edit(template: TodoTemplate) {
    setDraft({
      id: template.id,
      name: template.name,
      durationText: String(template.durationMinutes),
      reminders: template.reminders,
      isNew: false,
    });
    setError(null);
  }

  function create() {
    setDraft({
      id: Crypto.randomUUID(),
      name: '',
      durationText: '30',
      reminders: [],
      isNew: true,
    });
    setError(null);
  }

  async function save() {
    if (draft === null) return;
    const parsed = TodoTemplateSchema.safeParse({
      id: draft.id,
      name: draft.name,
      durationMinutes: Number(draft.durationText),
      reminders: draft.reminders,
    });
    if (!parsed.success) {
      setError(templateErrorMessage(parsed.error.issues[0]?.path[0]));
      return;
    }
    const normalizedName = parsed.data.name.toLocaleLowerCase();
    if (
      templates.some(
        (template) =>
          template.id !== parsed.data.id &&
          template.name.trim().toLocaleLowerCase() === normalizedName,
      )
    ) {
      setError('模板名称不能重复');
      return;
    }
    try {
      if (draft.isNew) await onCreate(parsed.data);
      else await onUpdate(parsed.data);
      setDraft(null);
      setError(null);
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  }

  function confirmDelete(template: TodoTemplate) {
    Alert.alert('删除常用模板？', `“${template.name}”将从常用选项中移除，已创建的事项不受影响。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () =>
          void onDelete(template.id).catch((deleteError) =>
            Alert.alert('删除失败', errorMessage(deleteError)),
          ),
      },
    ]);
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= templates.length) return;
    const ids = templates.map((template) => template.id);
    const currentId = ids[index];
    const targetId = ids[target];
    if (currentId === undefined || targetId === undefined) return;
    ids[index] = targetId;
    ids[target] = currentId;
    try {
      await onReorder(ids);
    } catch (reorderError) {
      Alert.alert('排序失败', errorMessage(reorderError));
    }
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.color.surface }]}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={draft ? () => setDraft(null) : onClose}
            >
              <Text style={[styles.action, { color: theme.color.textSecondary }]}>
                {draft ? '返回' : '关闭'}
              </Text>
            </Pressable>
            <Text style={[styles.heading, { color: theme.color.text }]}>
              {draft ? (draft.isNew ? '新建模板' : '编辑模板') : '常用模板'}
            </Text>
            {draft ? (
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()}>
                <Text style={[styles.action, { color: theme.color.accent }]}>
                  {saving ? '保存中' : '保存'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={templates.length >= MAX_TODO_TEMPLATES || saving}
                onPress={create}
              >
                <Text
                  style={[
                    styles.action,
                    {
                      color:
                        templates.length >= MAX_TODO_TEMPLATES
                          ? theme.color.textMuted
                          : theme.color.accent,
                    },
                  ]}
                >
                  新建
                </Text>
              </Pressable>
            )}
          </View>

          {draft ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.color.text }]}>模板名称</Text>
              <TextInput
                accessibilityLabel="模板名称"
                autoFocus
                maxLength={80}
                value={draft.name}
                onChangeText={(name) =>
                  setDraft((current) => (current ? { ...current, name } : current))
                }
                placeholder="例如：会议"
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
              <Text style={[styles.label, { color: theme.color.text }]}>默认时长（分钟）</Text>
              <TextInput
                accessibilityLabel="模板默认时长（分钟）"
                keyboardType="number-pad"
                value={draft.durationText}
                onChangeText={(durationText) =>
                  setDraft((current) => (current ? { ...current, durationText } : current))
                }
                placeholder="1–1440"
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
                onPress={() => setEditingReminders(true)}
                style={[styles.reminderButton, { borderColor: theme.color.border }]}
              >
                <View style={styles.flex}>
                  <Text style={[styles.label, { color: theme.color.text }]}>提醒规则</Text>
                  <Text style={[styles.help, { color: theme.color.textSecondary }]}>
                    {remindersLabel(draft.reminders)}
                  </Text>
                </View>
                <Text style={{ color: theme.color.accent, fontWeight: '700' }}>编辑</Text>
              </Pressable>
              {error ? (
                <Text style={[styles.error, { color: theme.color.critical }]}>{error}</Text>
              ) : null}
              <Text style={[styles.help, { color: theme.color.textSecondary }]}>
                套用模板时会保留事项标题、日期、开始时间等内容，只替换时长和提醒规则。
              </Text>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {templates.map((template, index) => (
                <View
                  key={template.id}
                  style={[
                    styles.templateRow,
                    { backgroundColor: theme.color.background, borderColor: theme.color.border },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => edit(template)}
                    style={styles.flex}
                  >
                    <Text style={[styles.templateName, { color: theme.color.text }]}>
                      {template.name}
                    </Text>
                    <Text style={[styles.help, { color: theme.color.textSecondary }]}>
                      {durationLabel(template.durationMinutes)} ·{' '}
                      {remindersLabel(template.reminders)}
                    </Text>
                  </Pressable>
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`上移${template.name}`}
                      disabled={index === 0 || saving}
                      onPress={() => void move(index, -1)}
                    >
                      <Text
                        style={{ color: index === 0 ? theme.color.textMuted : theme.color.accent }}
                      >
                        ↑
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`下移${template.name}`}
                      disabled={index === templates.length - 1 || saving}
                      onPress={() => void move(index, 1)}
                    >
                      <Text
                        style={{
                          color:
                            index === templates.length - 1
                              ? theme.color.textMuted
                              : theme.color.accent,
                        }}
                      >
                        ↓
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`删除${template.name}`}
                      disabled={saving}
                      onPress={() => confirmDelete(template)}
                    >
                      <Text style={{ color: theme.color.critical }}>删除</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {templates.length === 0 ? (
                <Text style={[styles.help, { color: theme.color.textSecondary }]}>
                  还没有常用模板。
                </Text>
              ) : null}
              <Text style={[styles.help, { color: theme.color.textMuted }]}>
                已有 {templates.length}/{MAX_TODO_TEMPLATES} 个。模板仅在新建定时事项时显示。
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
      {draft ? (
        <TodoReminderEditor
          visible={editingReminders}
          value={draft.reminders}
          timingKind="timed"
          onClose={() => setEditingReminders(false)}
          onChange={(reminders) =>
            setDraft((current) => (current ? { ...current, reminders } : current))
          }
        />
      ) : null}
    </Modal>
  );
}

function templateErrorMessage(field: PropertyKey | undefined): string {
  if (field === 'name') return '模板名称需为 1–80 个字符';
  if (field === 'durationMinutes') return '时长需为 1–1440 之间的整数分钟数';
  if (field === 'reminders') return '开始与截止提醒合计最多 10 条，且不能重复';
  return '模板内容无效';
}

function durationLabel(minutes: number): string {
  if (minutes === 1_440) return '1 天';
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function remindersLabel(reminders: readonly ReminderRule[]): string {
  if (reminders.length === 0) return '不提醒';
  const starts = reminders.filter((rule) => rule.anchor === 'start').length;
  const dues = reminders.length - starts;
  return [`开始 ${starts} 条`, `截止 ${dues} 条`]
    .filter((_, index) => (index === 0 ? starts : dues) > 0)
    .join(' · ');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  heading: { fontSize: 17, fontWeight: '700' },
  action: { minWidth: 56, fontSize: 15, fontWeight: '700' },
  content: { padding: 20, gap: 14 },
  label: { fontSize: 15, fontWeight: '700' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
  reminderButton: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flex: { flex: 1 },
  help: { fontSize: 13, lineHeight: 19 },
  error: { fontSize: 13, fontWeight: '600' },
  templateRow: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateName: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
