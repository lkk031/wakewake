import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Controller, useForm } from 'react-hook-form';
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
import { getWallClockDateTime, wallClockToInstant, type RecurrenceRule } from '@wakewake/domain';

import { useAppTheme } from '@/theme/useAppTheme';
import { todoSubmitErrorMessage, type TodoFormValues } from './todoForm';
import { TodoRecurrenceEditor, TodoReminderEditor } from './TodoRuleEditors';

interface TodoFormProps {
  initialValues: TodoFormValues;
  timezone: string;
  saving: boolean;
  recurrenceLocked?: boolean;
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
  onCancel,
  onSubmit,
}: TodoFormProps) {
  const theme = useAppTheme();
  const [picker, setPicker] = useState<PickerField | null>(null);
  const [ruleEditor, setRuleEditor] = useState<'reminders' | 'recurrence' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
              onValueChange={(enabled) => setValue('timingKind', enabled ? 'unscheduled' : 'timed')}
              trackColor={{ false: theme.color.border, true: theme.color.accent }}
            />
          </SettingRow>
          {!inbox ? (
            <>
              <SettingRow label="全天事项" hint="按日历日期展示">
                <Switch
                  value={allDay}
                  disabled={recurrenceLocked}
                  onValueChange={(enabled) => setValue('timingKind', enabled ? 'allDay' : 'timed')}
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
                    label="开始"
                    hint={values.startTime}
                    onPress={recurrenceLocked ? undefined : () => setPicker('startTime')}
                  />
                  <SettingRow
                    label="截止日期"
                    hint={values.dueDate}
                    onPress={recurrenceLocked ? undefined : () => setPicker('dueDate')}
                  />
                  <SettingRow
                    label="截止"
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
                hint={remindersLabel(values.reminders.map((rule) => rule.offsetMinutes))}
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

function remindersLabel(offsets: number[]): string {
  if (offsets.length === 0) return '不提醒';
  return offsets
    .slice()
    .sort((a, b) => b - a)
    .map((offset) => {
      if (offset % 1_440 === 0) return `${offset / 1_440} 天前`;
      if (offset % 60 === 0) return `${offset / 60} 小时前`;
      return `${offset} 分钟前`;
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
  card: { borderWidth: 1, borderRadius: 22, overflow: 'hidden', marginTop: 28 },
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
