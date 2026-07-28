import {
  BackupSettingsSchema,
  ReminderRulesSchema,
  type BackupSettings,
  type ReminderRule,
} from '@wakewake/domain';

import type { TransactionDatabase } from '../transaction';
import { withTransaction } from '../transaction';
import {
  mapReminderRuleRow,
  mapSettingsRow,
  type ReminderRuleRow,
  type SettingsRow,
} from '../rowMappers';

export class SettingsRepository {
  public constructor(private readonly database: TransactionDatabase) {}

  public async getSettings(): Promise<BackupSettings> {
    const row = await this.database.getFirstAsync<SettingsRow>(
      `SELECT theme_mode, timezone_mode, timezone, locale, week_starts_on, default_duration_minutes
       FROM app_settings WHERE id = ?`,
      [1],
    );
    if (row === null) throw new Error('Application settings are not initialized');
    return mapSettingsRow(row);
  }

  public async updateSettings(settingsValue: BackupSettings, now = new Date()): Promise<void> {
    const settings = BackupSettingsSchema.parse(settingsValue);
    const result = await this.database.runAsync(
      `UPDATE app_settings SET
        theme_mode = ?, timezone_mode = ?, timezone = ?, locale = ?, week_starts_on = ?,
        default_duration_minutes = ?, updated_at = ?
       WHERE id = ?`,
      [
        settings.themeMode,
        settings.timezoneMode,
        settings.timezone,
        settings.locale,
        settings.weekStartsOn,
        settings.defaultDurationMinutes,
        now.toISOString(),
        1,
      ],
    );
    if (result.changes !== 1) throw new Error('Application settings are not initialized');
  }

  public async getTimezone(): Promise<string> {
    return (await this.getSettings()).timezone;
  }

  public async setTimezone(timezone: string): Promise<void> {
    await this.updateSettings({ ...(await this.getSettings()), timezone });
  }

  public async synchronizeSystemTimezone(timezone: string, now = new Date()): Promise<boolean> {
    const current = await this.getSettings();
    if (current.timezoneMode !== 'system' || current.timezone === timezone) return false;
    await this.updateSettings({ ...current, timezone }, now);
    return true;
  }

  public async getDefaultDurationMinutes(): Promise<number> {
    return (await this.getSettings()).defaultDurationMinutes;
  }

  public async setDefaultDurationMinutes(defaultDurationMinutes: number): Promise<void> {
    await this.updateSettings({ ...(await this.getSettings()), defaultDurationMinutes });
  }

  public async getDefaultReminders(): Promise<ReminderRule[]> {
    const rows = await this.database.getAllAsync<ReminderRuleRow>(
      `SELECT id, offset_minutes, sort_order FROM default_reminder_rules
       ORDER BY sort_order, id`,
      [],
    );
    return ReminderRulesSchema.parse(rows.map(mapReminderRuleRow));
  }

  public async setDefaultReminders(reminderValues: ReminderRule[]): Promise<void> {
    const reminders = ReminderRulesSchema.parse(reminderValues);
    await withTransaction(this.database, async (transaction) => {
      await transaction.runAsync('DELETE FROM default_reminder_rules', []);
      for (const [sortOrder, reminder] of reminders.entries()) {
        await transaction.runAsync(
          `INSERT INTO default_reminder_rules (id, offset_minutes, sort_order)
           VALUES (?, ?, ?)`,
          [reminder.id, reminder.offsetMinutes, sortOrder],
        );
      }
    });
  }
}
