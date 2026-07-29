import type { NotificationPermissionState } from '@/services/notifications/nativeAdapter';
import type { NotificationSyncStatus } from '@/query/notificationReconciliation';

export function notificationPermissionLabel(
  permission: NotificationPermissionState | undefined,
): string {
  if (permission?.granted && permission.channelState === 'blocked') {
    return '已允许 · 事项提醒类别已关闭';
  }
  if (permission === undefined) return '读取中';
  return {
    granted: '已允许',
    denied: '已拒绝 · 点击打开',
    undetermined: '尚未请求 · 点击开启',
    unsupported: '当前平台不支持',
  }[permission.status];
}

export function notificationSyncLabel(status: NotificationSyncStatus | undefined): string {
  if (status === undefined || status.state === 'idle') return '等待首次检查 · 点击修复';
  if (status.state === 'running') return '正在检查并重建…';
  if (status.state === 'error') return '检查失败 · 点击修复';

  const { result } = status;
  if (result.skippedForPermission) return '等待通知权限 · 点击修复';
  if (result.failed > 0) return `${result.failed} 个操作失败 · 点击修复`;
  if (result.truncated) {
    return `未来有效 ${result.plannedCount} 条 · ${result.truncatedCount} 条待后续登记`;
  }
  if (result.plannedCount === 0 && result.skippedExpiredCount > 0) {
    return `无未来有效提醒 · ${result.skippedExpiredCount} 条提醒时间已过`;
  }
  const expired =
    result.skippedExpiredCount > 0 ? ` · ${result.skippedExpiredCount} 条提醒时间已过` : '';
  const registered = result.scheduled > 0 ? ` · 本次登记 ${result.scheduled} 条` : '';
  return `未来有效 ${result.plannedCount} 条${registered}${expired}`;
}
