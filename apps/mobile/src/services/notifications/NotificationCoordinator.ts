import type { NotificationRepository } from '@/db/repositories/NotificationRepository';
import type { TodoRepository } from '@/db/repositories/TodoRepository';
import type { NotificationNativeAdapter } from './nativeAdapter';
import { planNotifications, type DesiredNotification } from './planner';

export interface ReconcileResult {
  scheduled: number;
  cancelled: number;
  removedMappings: number;
  failed: number;
  skippedForPermission: boolean;
  truncated: boolean;
}

export class NotificationCoordinator {
  private currentRun: Promise<ReconcileResult> | null = null;
  private rerunRequested = false;

  public constructor(
    private readonly todoRepository: TodoRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly nativeAdapter: NotificationNativeAdapter,
  ) {}

  public reconcile(now = new Date()): Promise<ReconcileResult> {
    if (this.currentRun !== null) {
      this.rerunRequested = true;
      return this.currentRun;
    }
    const run = this.runReconcile(now)
      .then(async (result) => {
        while (this.rerunRequested) {
          this.rerunRequested = false;
          await this.runReconcile(new Date());
        }
        return result;
      })
      .finally(() => {
        if (this.currentRun === run) this.currentRun = null;
      });
    this.currentRun = run;
    return run;
  }

  public async getPermissionState() {
    return this.nativeAdapter.getPermissionState();
  }

  public async requestPermission() {
    const state = await this.nativeAdapter.requestPermission();
    if (state.granted) await this.reconcile();
    return state;
  }

  public async scheduleTestNotification(delaySeconds = 10): Promise<string> {
    const permission = await this.nativeAdapter.getPermissionState();
    if (!permission.granted) throw new Error('Notification permission is not granted');
    await this.nativeAdapter.ensureChannel();
    return this.nativeAdapter.scheduleTest(new Date(Date.now() + delaySeconds * 1_000));
  }

  private async runReconcile(now: Date): Promise<ReconcileResult> {
    const result: ReconcileResult = {
      scheduled: 0,
      cancelled: 0,
      removedMappings: 0,
      failed: 0,
      skippedForPermission: false,
      truncated: false,
    };
    if (!this.nativeAdapter.supported) return result;

    await this.nativeAdapter.ensureChannel();
    const permission = await this.nativeAdapter.getPermissionState();
    result.skippedForPermission = !permission.granted;

    const [todos, occurrenceStates, mappings, nativeRequests] = await Promise.all([
      this.todoRepository.listAll(),
      this.todoRepository.listOccurrenceStates(),
      this.notificationRepository.listAll(),
      this.nativeAdapter.listScheduled(),
    ]);
    const plan = permission.granted
      ? planNotifications(todos, occurrenceStates, { now })
      : { notifications: [], truncated: false };
    result.truncated = plan.truncated;
    const desiredByKey = new Map(plan.notifications.map((item) => [item.logicalKey, item]));
    const mappingByKey = new Map(mappings.map((item) => [item.logicalKey, item]));
    const nativeById = new Map(nativeRequests.map((item) => [item.identifier, item]));
    const handledNativeIds = new Set<string>();

    for (const mapping of mappings) {
      const desired = desiredByKey.get(mapping.logicalKey);
      const native = nativeById.get(mapping.nativeNotificationId);
      const valid =
        desired !== undefined &&
        native?.logicalKey === mapping.logicalKey &&
        mapping.scheduledAt.getTime() === desired.scheduledAt.getTime();
      if (valid) {
        handledNativeIds.add(mapping.nativeNotificationId);
        continue;
      }
      handledNativeIds.add(mapping.nativeNotificationId);
      mappingByKey.delete(mapping.logicalKey);
      nativeById.delete(mapping.nativeNotificationId);
      try {
        if (native !== undefined) {
          await this.nativeAdapter.cancel(mapping.nativeNotificationId);
          result.cancelled += 1;
        }
        if (await this.notificationRepository.remove(mapping.logicalKey)) {
          result.removedMappings += 1;
        }
      } catch {
        result.failed += 1;
      }
    }

    for (const native of nativeRequests) {
      if (handledNativeIds.has(native.identifier)) continue;
      try {
        await this.nativeAdapter.cancel(native.identifier);
        result.cancelled += 1;
      } catch {
        result.failed += 1;
      }
    }

    for (const desired of plan.notifications) {
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
  ): Promise<void> {
    let nativeId: string | null = null;
    try {
      nativeId = await this.nativeAdapter.schedule(desired);
      await this.notificationRepository.upsert({
        logicalKey: desired.logicalKey,
        nativeNotificationId: nativeId,
        todoId: desired.todoId,
        occurrenceKey: desired.occurrenceKey,
        reminderRuleId: desired.reminderRuleId,
        scheduledAt: desired.scheduledAt,
      });
      result.scheduled += 1;
    } catch {
      result.failed += 1;
      if (nativeId !== null) {
        try {
          await this.nativeAdapter.cancel(nativeId);
        } catch {
          result.failed += 1;
        }
      }
    }
  }
}
