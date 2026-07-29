import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Controller, useForm } from 'react-hook-form';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getWallClockDateTime,
  wallClockToInstant,
  type RecurrenceRule,
  type TodoTemplate,
} from '@wakewake/domain';

import { useAppTheme } from '@/theme/useAppTheme';
import {
  applyTodoTemplate,
  getTodoFormReminderTimings,
  normalizeRemindersForTimingKind,
  todoSubmitErrorMessage,
  type TodoFormValues,
} from './todoForm';
import { TodoRecurrenceEditor, TodoReminderEditor } from './TodoRuleEditors';

interface TodoFormProps {
  initialValues: TodoFormValues;
  timezone: string;
  saving: boolean;
  recurrenceLocked?: boolean;
  templates?: readonly TodoTemplate[];
  onCancel: () => void;
  onSubmit: (values: TodoFormValues) => Promise<void>;
}

type PickerField = 'date' | 'startTime' | 'dueDate' | 'dueTime' | 'allDayEndDate';

function pickerValue(values: TodoFormValues, field: PickerField, timezone: string): Date {
  const selectedDate =
    field === 'dueDate' || field === 'dueTime'
      ? values.dueDate
      : field === 'allDayEndDate'
        ? values.allDayEndDate
        : values.date;
  const [year, month, day] = selectedDate.split('-').map(Number);
  const source = field === 'dueTime' ? values.dueTime : values.startTime;
  const [hour, minute] = source.split(':').map(Number);
  return wallClockToInstant(
    {
      year: year ?? 2000,
      month: month ?? 1,
      day: day ?? 1,
      hour: hour ?? 0,
      minute: minute ?? 0,
      second: 0,
      millisecond: 0,
    },
    timezone,
  );
}

export function TodoForm({
  initialValues,
  timezone,
  saving,
  recurrenceLocked = false,
  templates = [],
  onCancel,
  onSubmit,
}: TodoFormProps) {
  const theme = useAppTheme();
  const [picker, setPicker] = useState<PickerField | null>(null);
  const [ruleEditor, setRuleEditor] = useState<'reminders' | 'recurrence' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastAppliedTemplateId, setLastAppliedTemplateId] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TodoFormValues>({ defaultValues: initialValues });
  const values = watch();
  const inbox = values.timingKind === 'unscheduled';
  const allDay = values.timingKind === 'allDay';
  const reminderTimings = getTodoFormReminderTimings(values, timezone);
  const futureReminderTimings = reminderTimings
    .filter((timing) => !timing.expired)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const allReminderTimingsExpired =
    values.reminders.length > 0 && reminderTimings.length > 0 && futureReminderTimings.length === 0;

  function updatePicker(selected: Date) {
    if (Platform.OS === 'android') setPicker(null);
    if (picker === null) return;
    const parts = getWallClockDateTime(selected, timezone);
    if (picker === 'date' || picker === 'dueDate' || picker === 'allDayEndDate') {
      setValue(
        picker,
        `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
      );
    } else {
      setValue(
        picker,
        `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
      );
    }
  }

  async function submit(valuesToSave: TodoFormValues) {
    setSubmitError(null);
    try {
      await onSubmit(valuesToSave);
    } catch (error) {
      setSubmitError(todoSubmitErrorMessage(error));
    }
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.color.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          onPress={onCancel}
          style={styles.headerButton}
        >
          <Ionicons name="close" size={25} color={theme.color.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.color.text }]}>事项</Text>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void handleSubmit(submit)()}
        >
          <Text
            style={[styles.save, { color: saving ? theme.color.textMuted : theme.color.accent }]}
          >
            {saving ? '保存中' : '保存'}
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="title"
          rules={{
            required: '请输入事项标题',
            maxLength: { value: 200, message: '标题不能超过 200 字' },
          }}
          render={({ field }) => (
            <TextInput
              autoFocus
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="要做什么？"
              placeholderTextColor={theme.color.textMuted}
              style={[
                styles.titleInput,
                { color: theme.color.text, borderBottomColor: theme.color.border },
              ]}
            />
          )}
        />
        {errors.title?.message ? (
          <Text style={[styles.error, { color: theme.color.critical }]}>
            {errors.title.message}
          </Text>
        ) : null}

        {!inbox && !allDay && templates.length > 0 ? (
          <View style={styles.templates}>
            <Text style={[styles.templatesTitle, { color: theme.color.textSecondary }]}>
              常用模板
            </Text>
            <ScrollView
              horizontal
              contentContainerStyle={styles.templateList}
              showsHorizontalScrollIndicator={false}
            >
              {templates.map((template) => {
                const applied = template.id === lastAppliedTemplateId;
                return (
                  <Pressable
                    key={template.id}
                    accessibilityRole="button"
                    accessibilityLabel={`套用${template.name}模板`}
                    accessibilityState={{ selected: applied }}
                    onPress={() => {
                      const next = applyTodoTemplate(values, template, timezone, Crypto.randomUUID);
                      setValue('dueDate', next.dueDate);
                      setValue('dueTime', next.dueTime);
                      setValue('reminders', next.reminders);
                      setLastAppliedTemplateId(template.id);
                    }}
                    style={[
                      styles.template,
                      {
                        backgroundColor: applied ? theme.color.accentSoft : theme.color.surface,
                        borderColor: applied ? theme.color.accent : theme.color.border,
                      },
                    ]}
                  >
                    <View style={styles.templateHeading}>
                      <Text
                        style={[
                          styles.templateName,
                          { color: applied ? theme.color.accentInk : theme.color.text },
                        ]}
                      >
                        {template.name}
                      </Text>
                      {applied ? (
                        <View
                          style={[styles.appliedBadge, { backgroundColor: theme.color.accent }]}
                        >
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color={theme.isDark ? theme.color.background : theme.color.surface}
                          />
                          <Text
                            style={[
                              styles.appliedBadgeText,
                              {
                                color: theme.isDark ? theme.color.background : theme.color.surface,
                              },
                            ]}
                          >
                            已套用
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.templateHint,
                        { color: applied ? theme.color.accentInk : theme.color.textSecondary },
                      ]}
                    >
                      {templateDurationLabel(template.durationMinutes)} ·{' '}
                      {remindersLabel(template.reminders, false)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {lastAppliedTemplateId === null ? null : (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.templateFeedback, { color: theme.color.accentInk }]}
              >
                已套用“
                {templates.find((template) => template.id === lastAppliedTemplateId)?.name ??
                  '模板'}
                ”：截止时间和提醒已更新
              </Text>
            )}
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            { backgroundColor: theme.color.surface, borderColor: theme.color.border },
          ]}
        >
          <SettingRow label="放进收集箱" hint="不设置日期，之后再安排">
            <Switch
              value={inbox}
              disabled={recurrenceLocked}
              onValueChange={(enabled) => {
                const timingKind = enabled ? 'unscheduled' : 'timed';
                setValue('timingKind', timingKind);
                setValue(
                  'reminders',
                  normalizeRemindersForTimingKind(values.reminders, timingKind),
                );
              }}
              trackColor={{ false: theme.color.border, true: theme.color.accent }}
            />
          </SettingRow>
          {!inbox ? (
            <>
              <SettingRow label="全天事项" hint="按日历日期展示">
                <Switch
                  value={allDay}
                  disabled={recurrenceLocked}
                  onValueChange={(enabled) => {
                    const timingKind = enabled ? 'allDay' : 'timed';
                    setValue('timingKind', timingKind);
                    setValue(
                      'reminders',
                      normalizeRemindersForTimingKind(values.reminders, timingKind),
                    );
                  }}
                  trackColor={{ false: theme.color.border, true: theme.color.accent }}
                />
              </SettingRow>
              <SettingRow
                label={allDay ? '开始日期' : '开始日期'}
                hint={values.date}
                onPress={recurrenceLocked ? undefined : () => setPicker('date')}
              />
              {allDay ? (
                <SettingRow
                  label="结束日期（不含）"
                  hint={values.allDayEndDate}
                  onPress={recurrenceLocked ? undefined : () => setPicker('allDayEndDate')}
                />
              ) : (
                <>
                  <SettingRow
                    label="开始时间"
                    hint={values.startTime}
                    onPress={recurrenceLocked ? undefined : () => setPicker('startTime')}
                  />
                  <SettingRow
                    label="截止日期"
                    hint={values.dueDate}
                    onPress={recurrenceLocked ? undefined : () => setPicker('dueDate')}
                  />
                  <SettingRow
                    label="截止时间"
                    hint={values.dueTime}
                    onPress={recurrenceLocked ? undefined : () => setPicker('dueTime')}
                  />
                </>
              )}
            </>
          ) : null}
          {!inbox ? (
            <>
              <SettingRow
                label="提醒"
                hint={remindersLabel(values.reminders, allDay)}
                onPress={() => setRuleEditor('reminders')}
              />
              <SettingRow
                label="重复"
                hint={recurrenceLabel(values.recurrence)}
                onPress={() => setRuleEditor('recurrence')}
              />
            </>
          ) : null}
          <SettingRow
            label="优先级"
            hint={priorityLabel(values.priority)}
            onPress={() => setValue('priority', nextPriority(values.priority))}
          />
        </View>

        {!inbox && values.reminders.length > 0 ? (
          <View
            style={[
              styles.reminderNotice,
              {
                backgroundColor: allReminderTimingsExpired
                  ? theme.color.amberSoft
                  : theme.color.surface,
                borderColor: allReminderTimingsExpired ? theme.color.amber : theme.color.border,
              },
            ]}
          >
            <Text
              accessibilityLiveRegion={allReminderTimingsExpired ? 'polite' : 'none'}
              style={[
                styles.reminderNoticeTitle,
                { color: allReminderTimingsExpired ? theme.color.amber : theme.color.text },
              ]}
            >
              {allReminderTimingsExpired
                ? '当前提醒时间均已过'
                : `下一条提醒：${formatReminderDateTime(futureReminderTimings[0]?.scheduledAt, timezone)}`}
            </Text>
            <Text style={[styles.reminderNoticeCopy, { color: theme.color.textSecondary }]}>
              {allReminderTimingsExpired
                ? '这些规则不会补发。请调整开始或截止时间，或缩短提前量。重复事项的后续实例仍会继续规划。'
                : allDay
                  ? '全天提醒以开始日 09:00 为基准。'
                  : '日历按开始时间显示；开始提醒随开始时间变化，截止提醒只随截止时间变化。'}
            </Text>
          </View>
        ) : null}

        <Controller
          control={control}
          name="notes"
          rules={{ maxLength: { value: 5_000, message: '备注不能超过 5000 字' } }}
          render={({ field }) => (
            <TextInput
              multiline
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="备注"
              placeholderTextColor={theme.color.textMuted}
              style={[
                styles.notes,
                {
                  color: theme.color.text,
                  backgroundColor: theme.color.surface,
                  borderColor: theme.color.border,
                },
              ]}
            />
          )}
        />
        {errors.notes?.message ? (
          <Text style={[styles.error, { color: theme.color.critical }]}>
            {errors.notes.message}
          </Text>
        ) : null}
        {submitError ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.error, { color: theme.color.critical }]}
          >
            {submitError}
          </Text>
        ) : null}
      </ScrollView>
      <TodoReminderEditor
        visible={ruleEditor === 'reminders'}
        value={values.reminders}
        timingKind={allDay ? 'allDay' : 'timed'}
        onClose={() => setRuleEditor(null)}
        onChange={(next) => setValue('reminders', next)}
      />
      <TodoRecurrenceEditor
        visible={ruleEditor === 'recurrence'}
        value={values.recurrence}
        anchorWeekday={weekdayForDate(values.date)}
        locked={recurrenceLocked}
        onClose={() => setRuleEditor(null)}
        onChange={(next) => setValue('recurrence', next)}
      />
      {picker !== null ? (
        <DateTimePicker
          value={pickerValue(values, picker, timezone)}
          mode={
            picker === 'date' || picker === 'dueDate' || picker === 'allDayEndDate'
              ? 'date'
              : 'time'
          }
          is24Hour
          onValueChange={(_, selected) => updatePicker(selected)}
          onDismiss={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}

interface SettingRowProps {
  label: string;
  hint: string;
  children?: React.ReactNode;
  onPress?: (() => void) | undefined;
}

function SettingRow({ label, hint, children, onPress }: SettingRowProps) {
  const theme = useAppTheme();
  const content = (
    <>
      <View style={styles.rowCopy}>
        <Text style={[styles.label, { color: theme.color.text }]}>{label}</Text>
        <Text style={[styles.hint, { color: theme.color.textSecondary }]}>{hint}</Text>
      </View>
      {children ?? <Ionicons name="chevron-forward" size={18} color={theme.color.textMuted} />}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { borderTopColor: theme.color.border }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, { borderTopColor: theme.color.border }]}>{content}</View>
  );
}

function nextPriority(value: TodoFormValues['priority']): TodoFormValues['priority'] {
  const order = ['none', 'low', 'medium', 'high'] as const;
  const index = order.indexOf(value);
  return order[(index + 1) % order.length] ?? 'none';
}

function priorityLabel(value: TodoFormValues['priority']): string {
  return { none: '无', low: '低', medium: '中', high: '高' }[value];
}

function recurrenceLabel(value: RecurrenceRule | null): string {
  if (value === null) return '不重复';
  if (value.frequency === 'daily') return '每天';
  return `每周 · ${value.weekdays.map((day) => ['日', '一', '二', '三', '四', '五', '六'][day]).join('、')}`;
}

function weekdayForDate(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

function formatReminderDateTime(date: Date | undefined, timezone: string): string {
  if (date === undefined) return '没有未来有效提醒';
  const parts = getWallClockDateTime(date, timezone);
  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function templateDurationLabel(minutes: number): string {
  if (minutes % 1_440 === 0) return `${minutes / 1_440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function remindersLabel(reminders: TodoFormValues['reminders'], allDay: boolean): string {
  if (reminders.length === 0) return '不提醒';
  return reminders
    .slice()
    .sort((a, b) => a.anchor.localeCompare(b.anchor) || b.offsetMinutes - a.offsetMinutes)
    .map((rule) => {
      const anchor = allDay ? '开始日 09:00' : rule.anchor === 'start' ? '开始' : '截止';
      if (rule.offsetMinutes === 0) return `${anchor}时`;
      if (rule.offsetMinutes % 1_440 === 0) {
        return `${anchor}前 ${rule.offsetMinutes / 1_440} 天`;
      }
      if (rule.offsetMinutes % 60 === 0) {
        return `${anchor}前 ${rule.offsetMinutes / 60} 小时`;
      }
      return `${anchor}前 ${rule.offsetMinutes} 分钟`;
    })
    .join('、');
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  save: { fontSize: 15, fontWeight: '700', padding: 10 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  titleInput: { fontSize: 27, fontWeight: '700', paddingVertical: 18, borderBottomWidth: 1 },
  templates: { marginTop: 24 },
  templatesTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 9 },
  templateList: { gap: 10, paddingRight: 4 },
  template: { width: 210, minHeight: 78, borderWidth: 1, borderRadius: 18, padding: 14 },
  templateHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  templateName: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  templateHint: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  appliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  appliedBadgeText: { fontSize: 10, fontWeight: '800' },
  templateFeedback: { fontSize: 12, lineHeight: 18, fontWeight: '600', marginTop: 9 },
  card: { borderWidth: 1, borderRadius: 22, overflow: 'hidden', marginTop: 28 },
  reminderNotice: {
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reminderNoticeTitle: { fontSize: 13, fontWeight: '800' },
  reminderNoticeCopy: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowCopy: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 4 },
  notes: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 20,
    marginTop: 20,
    padding: 16,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  error: { fontSize: 12, marginTop: 8 },
});
