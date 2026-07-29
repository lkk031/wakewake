export const todoKeys = {
  all: ['todos'] as const,
  inbox: () => [...todoKeys.all, 'inbox'] as const,
  detail: (id: string) => [...todoKeys.all, 'detail', id] as const,
  range: (start: string, end: string, timezone: string) =>
    [...todoKeys.all, 'range', { start, end, timezone }] as const,
  agenda: (start: string, end: string, timezone: string) =>
    [...todoKeys.all, 'agenda', { start, end, timezone }] as const,
  occurrenceStates: (todoIds?: readonly string[]) =>
    [...todoKeys.all, 'occurrence-states', todoIds ?? 'all'] as const,
};

export const settingsKeys = {
  all: ['settings'] as const,
  defaultReminders: ['settings', 'default-reminders'] as const,
  todoTemplates: ['settings', 'todo-templates'] as const,
};

export const notificationKeys = {
  all: ['notifications'] as const,
  permission: ['notifications', 'permission'] as const,
  syncStatus: ['notifications', 'sync-status'] as const,
};
