import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Todo } from '@wakewake/domain';

import type { TodoRange } from '@/db/repositories/TodoRepository';
import { useAppServices } from '@/providers/AppServicesProvider';
import { todoKeys } from './queryKeys';

export function useInboxTodos() {
  const { todoRepository } = useAppServices();
  return useQuery({
    queryKey: todoKeys.inbox(),
    queryFn: () => todoRepository.listInbox(),
  });
}

export function useTodo(id: string) {
  const { todoRepository } = useAppServices();
  return useQuery({
    queryKey: todoKeys.detail(id),
    queryFn: () => todoRepository.getById(id),
  });
}

export function useTodoRange(range: TodoRange, timezone: string) {
  const { todoRepository } = useAppServices();
  return useQuery({
    queryKey: todoKeys.range(range.start.toISOString(), range.end.toISOString(), timezone),
    queryFn: () => todoRepository.listRangeCandidates(range),
  });
}

export function useAgendaTodos(range: TodoRange, timezone: string, now: Date) {
  const { todoRepository } = useAppServices();
  return useQuery({
    queryKey: todoKeys.agenda(range.start.toISOString(), range.end.toISOString(), timezone),
    queryFn: () => todoRepository.listAgendaCandidates(range, now),
  });
}

export function useOccurrenceStates(todoIds?: string[]) {
  const { todoRepository } = useAppServices();
  return useQuery({
    queryKey: todoKeys.occurrenceStates(todoIds),
    queryFn: () => todoRepository.listOccurrenceStates(todoIds),
  });
}

export function useCreateTodo() {
  const { todoRepository, notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (todo: Todo) => todoRepository.create(todo),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: todoKeys.all });
      void notificationCoordinator.reconcile().catch(() => undefined);
    },
  });
}

export function useUpdateTodo() {
  const { todoRepository, notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (todo: Todo) => todoRepository.update(todo),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: todoKeys.all });
      void notificationCoordinator.reconcile().catch(() => undefined);
    },
  });
}

interface CompletionInput {
  todoId: string;
  completedAt: Date | null;
  occurrenceKey?: string;
}

export function useSetTodoCompletion() {
  const { todoRepository, notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ todoId, completedAt, occurrenceKey }: CompletionInput) =>
      todoRepository.setCompletion(todoId, completedAt, occurrenceKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: todoKeys.all });
      void notificationCoordinator.reconcile().catch(() => undefined);
    },
  });
}

export function useDeleteTodo() {
  const { todoRepository, notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => todoRepository.softDelete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: todoKeys.all });
      void notificationCoordinator.reconcile().catch(() => undefined);
    },
  });
}

export function useRestoreDeletedTodo() {
  const { todoRepository, notificationCoordinator } = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => todoRepository.restoreDeleted(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: todoKeys.all });
      void notificationCoordinator.reconcile().catch(() => undefined);
    },
  });
}
