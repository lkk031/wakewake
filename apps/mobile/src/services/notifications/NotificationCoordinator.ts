import type { ReminderAnchor } from '@wakewake/domain';

import type { NotificationRepository } from '@/db/repositories/NotificationRepository';
import type { TodoRepository } from '@/db/repositories/TodoRepository';
import type { NotificationNativeAdapter } from './nativeAdapter';
import { planNotifications, type DesiredNotification, type NotificationPlan } from './planner';

export type ReconcileIssueStage =
  | 'channel'
  | 'permission'
  | 'data-loading'
  | 'native-enumeration'
  | 'cancellation'
  | 'scheduling'
  | 'mapping-persistence';

export interface ReconcileIssue {
  stage: ReconcileIssueStage;
  message: string;
  todoId?: string;
  occurrenceKey?: string | null;
  reminderRuleId?: string;
  anchor?: ReminderAnchor;
  logicalKey?: string;
}

export interface ReconcileResult {
  scheduled: number;
  cancelled: number;
  removedMappings: number;
  failed: number;
  issues: ReconcileIssue[];
  skippedForPermission: boolean;
  plannedCount: number;
  skippedExpiredCount: number;
  missingTargetCount: number;
  truncatedCount: number;
  truncated: boolean;
}

const EMPTY_PLAN: Omit<NotificationPlan, 'notifications'> = {
  plannedCount: 0,
  skippedExpiredCount: 0,
  missingTargetCount: 0,
  truncatedCount: 0,
  truncated: false,
};

export class NotificationCoordinator {
  private currentRun: Promise<ReconcileResult> | null = null;
  private rerunRequested = false;
  private rerunForceRearm = false;
  private rerunNow: Date | null = null;

  public constructor(
    private readonly todoRepository: TodoRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly nativeAdapter: NotificationNativeAdapter,
  ) {}

  public reconcile(
    now = new Date(),
    options: { forceRearm?: boolean } = {},
  ): Promise<ReconcileResult> {
    if (this.currentRun !== null) {
      this.rerunRequested = true;
      this.rerunForceRearm ||= options.forceRearm === true;
      this.rerunNow = now;
      return this.currentRun;
    }

    const run = (async () => {
      let result = await this.runReconcile(now, options.forceRearm === true);
      while (this.rerunRequested) {
        const forceRearm = this.rerunForceRearm;
        this.rerunRequested = false;
        this.rerunForceRearm = false;
        const nextNow = this.rerunNow ?? new Date();
        this.rerunNow = null;
        result = mergeReconcileResults(result, await this.runReconcile(nextNow, forceRearm));
      }
      return result;
    })().finally(() => {
      if (this.currentRun === run) this.currentRun = null;
    });
    this.currentRun = run;
    return run;
  }

  public async getPermissionState() {
    return this.nativeAdapter.getPermissionState();
  }

  public requestPermission() {
    return this.nativeAdapter.requestPermission();
  }

  public async scheduleTestNotification(delaySeconds = 10): Promise<string> {
    await this.nativeAdapter.ensureChannel();
    const permission = await this.nativeAdapter.getPermissionState();
    if (!permission.granted) throw new Error('Notification permission is not granted');
    if (permission.channelState === 'blocked') {
      throw new Error('Notification channel is blocked');
    }
    return this.nativeAdapter.scheduleTest(new Date(Date.now() + delaySeconds * 1_000));
  }

  private async runReconcile(now: Date, forceRearm: boolean): Promise<ReconcileResult> {
    const result = emptyReconcileResult();
    if (!this.nativeAdapter.supported) return result;

    try {
      await this.nativeAdapter.ensureChannel();
    } catch {
      addIssue(result, { stage: 'channel', message: 'Notification channel setup failed' });
      return result;
    }

    let permission;
    try {
      permission = await this.nativeAdapter.getPermissionState();
    } catch {
      addIssue(result, {
        stage: 'permission',
        message: 'Notification permission could not be read',
      });
      return result;
    }
    result.skippedForPermission = !permission.granted;
    if (permission.channelState === 'blocked') {
      addIssue(result, {
        stage: 'channel',
        message: 'The reminder notification channel is blocked',
      });
      return result;
    }

    let todos;
    let occurrenceStates;
    let mappings;
    try {
      [todos, occurrenceStates, mappings] = await Promise.all([
        this.todoRepository.listAll(),
        this.todoRepository.listOccurrenceStates(),
        this.notificationRepository.listAll(),
      ]);
    } catch {
      addIssue(result, { stage: 'data-loading', message: 'Notification data could not be loaded' });
      return result;
    }

    let nativeRequests;
    try {
      nativeRequests = await this.nativeAdapter.listScheduled();
    } catch {
      addIssue(result, {
        stage: 'native-enumeration',
        message: 'Scheduled notifications could not be inspected',
      });
      return result;
    }

    const plan = permission.granted
      ? planNotifications(todos, occurrenceStates, { now })
      : { notifications: [], ...EMPTY_PLAN };
    applyPlanDiagnostics(result, plan);
    const desiredByKey = new Map(plan.notifications.map((item) => [item.logicalKey, item]));
    const mappingByKey = new Map(mappings.map((item) => [item.logicalKey, item]));
    const nativeById = new Map(nativeRequests.map((item) => [item.identifier, item]));
    const handledNativeIds = new Set<string>();
    const rearmedLogicalKeys = new Set<string>();
    const attemptedForceRearmKeys = new Set<string>();

    for (const mapping of mappings) {
      const desired = desiredByKey.get(mapping.logicalKey);
      const native = nativeById.get(mapping.nativeNotificationId);
      const valid =
        desired !== undefined &&
        native?.logicalKey === mapping.logicalKey &&
        mapping.scheduledAt.getTime() === desired.scheduledAt.getTime();
      if (valid && !forceRearm) {
        handledNativeIds.add(mapping.nativeNotificationId);
        continue;
      }
      if (valid) {
        handledNativeIds.add(mapping.nativeNotificationId);
        nativeById.delete(mapping.nativeNotificationId);
        attemptedForceRearmKeys.add(mapping.logicalKey);
        const scheduled = await this.scheduleDesired(desired, result, mapping.nativeNotificationId);
        if (scheduled) {
          rearmedLogicalKeys.add(mapping.logicalKey);
        } else {
          mappingByKey.delete(mapping.logicalKey);
          await this.removeFailedRearm(mapping, result);
        }
        continue;
      }

      handledNativeIds.add(mapping.nativeNotificationId);
      mappingByKey.delete(mapping.logicalKey);
      nativeById.delete(mapping.nativeNotificationId);
      if (native !== undefined) {
        try {
          await this.nativeAdapter.cancel(mapping.nativeNotificationId);
          result.cancelled += 1;
        } catch {
          addIssue(result, {
            stage: 'cancellation',
            message: 'A stale notification could not be cancelled',
            todoId: mapping.todoId,
            occurrenceKey: mapping.occurrenceKey,
            ...(mapping.reminderRuleId === null ? {} : { reminderRuleId: mapping.reminderRuleId }),
            logicalKey: mapping.logicalKey,
          });
        }
      }
      try {
        if (await this.notificationRepository.remove(mapping.logicalKey)) {
          result.removedMappings += 1;
        }
      } catch {
        addIssue(result, {
          stage: 'mapping-persistence',
          message: 'A stale notification mapping could not be removed',
          todoId: mapping.todoId,
          occurrenceKey: mapping.occurrenceKey,
          ...(mapping.reminderRuleId === null ? {} : { reminderRuleId: mapping.reminderRuleId }),
          logicalKey: mapping.logicalKey,
        });
      }
    }

    for (const native of nativeRequests) {
      if (handledNativeIds.has(native.identifier)) continue;
      try {
        await this.nativeAdapter.cancel(native.identifier);
        result.cancelled += 1;
      } catch {
        addIssue(result, {
          stage: 'cancellation',
          message: 'An unmanaged notification could not be cancelled',
          ...(native.logicalKey === null || native.logicalKey === undefined
            ? {}
            : { logicalKey: native.logicalKey }),
        });
      }
    }

    for (const desired of plan.notifications) {
      if (
        rearmedLogicalKeys.has(desired.logicalKey) ||
        attemptedForceRearmKeys.has(desired.logicalKey)
      ) {
        continue;
      }
      const mapping = mappingByKey.get(desired.logicalKey);
      const native =
        mapping === undefined ? undefined : nativeById.get(mapping.nativeNotificationId);
      if (
        mapping !== undefined &&
        native?.logicalKey === desired.logicalKey &&
        mapping.scheduledAt.getTime() === desired.scheduledAt.getTime()
      ) {
        continue;
      }
      await this.scheduleDesired(desired, result);
    }

    return result;
  }

  private async scheduleDesired(
    desired: DesiredNotification,
    result: ReconcileResult,
    identifier: string | undefined = undefined,
  ): Promise<boolean> {
    let nativeId: string;
    try {
      nativeId = await this.nativeAdapter.schedule(desired, identifier);
    } catch {
      addIssue(
        result,
        desiredIssue('scheduling', 'A notification could not be scheduled', desired),
      );
      return false;
    }

    try {
      await this.notificationRepository.upsert({
        logicalKey: desired.logicalKey,
        nativeNotificationId: nativeId,
        todoId: desired.todoId,
        occurrenceKey: desired.occurrenceKey,
        reminderRuleId: desired.reminderRuleId,
        scheduledAt: desired.scheduledAt,
      });
      result.scheduled += 1;
      return true;
    } catch {
      addIssue(
        result,
        desiredIssue(
          'mapping-persistence',
          'A scheduled notification mapping could not be saved',
          desired,
        ),
      );
      try {
        await this.nativeAdapter.cancel(nativeId);
        result.cancelled += 1;
      } catch {
        addIssue(
          result,
          desiredIssue('cancellation', 'An unmapped notification could not be cancelled', desired),
        );
      }
      return false;
    }
  }

  private async removeFailedRearm(
    mapping: Awaited<ReturnType<NotificationRepository['listAll']>>[number],
    result: ReconcileResult,
  ): Promise<void> {
    try {
      await this.nativeAdapter.cancel(mapping.nativeNotificationId);
      result.cancelled += 1;
    } catch {
      addIssue(result, {
        stage: 'cancellation',
        message: 'A failed rearm request could not be cancelled',
        todoId: mapping.todoId,
        occurrenceKey: mapping.occurrenceKey,
        ...(mapping.reminderRuleId === null ? {} : { reminderRuleId: mapping.reminderRuleId }),
        logicalKey: mapping.logicalKey,
      });
    }
    try {
      if (await this.notificationRepository.remove(mapping.logicalKey)) {
        result.removedMappings += 1;
      }
    } catch {
      addIssue(result, {
        stage: 'mapping-persistence',
        message: 'A failed rearm mapping could not be removed',
        todoId: mapping.todoId,
        occurrenceKey: mapping.occurrenceKey,
        ...(mapping.reminderRuleId === null ? {} : { reminderRuleId: mapping.reminderRuleId }),
        logicalKey: mapping.logicalKey,
      });
    }
  }
}

function emptyReconcileResult(): ReconcileResult {
  return {
    scheduled: 0,
    cancelled: 0,
    removedMappings: 0,
    failed: 0,
    issues: [],
    skippedForPermission: false,
    ...EMPTY_PLAN,
  };
}

function addIssue(result: ReconcileResult, issue: ReconcileIssue): void {
  result.issues.push(issue);
  result.failed = result.issues.length;
}

function desiredIssue(
  stage: ReconcileIssueStage,
  message: string,
  desired: DesiredNotification,
): ReconcileIssue {
  return {
    stage,
    message,
    todoId: desired.todoId,
    occurrenceKey: desired.occurrenceKey,
    reminderRuleId: desired.reminderRuleId,
    anchor: desired.anchor,
    logicalKey: desired.logicalKey,
  };
}

function applyPlanDiagnostics(result: ReconcileResult, plan: NotificationPlan): void {
  result.plannedCount = plan.plannedCount;
  result.skippedExpiredCount = plan.skippedExpiredCount;
  result.missingTargetCount = plan.missingTargetCount;
  result.truncatedCount = plan.truncatedCount;
  result.truncated = plan.truncated;
}

function mergeReconcileResults(
  previous: ReconcileResult,
  latest: ReconcileResult,
): ReconcileResult {
  const issues = [...previous.issues, ...latest.issues];
  return {
    scheduled: previous.scheduled + latest.scheduled,
    cancelled: previous.cancelled + latest.cancelled,
    removedMappings: previous.removedMappings + latest.removedMappings,
    failed: issues.length,
    issues,
    skippedForPermission: latest.skippedForPermission,
    plannedCount: latest.plannedCount,
    skippedExpiredCount: latest.skippedExpiredCount,
    missingTargetCount: latest.missingTargetCount,
    truncatedCount: latest.truncatedCount,
    truncated: latest.truncated,
  };
}
