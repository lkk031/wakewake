import type { OccurrenceState, Todo } from '@wakewake/domain';
import { describe, expect, it } from 'vitest';

import {
  compareVisibleTodoItems,
  partitionVisibleTodoItemsByCompletion,
  selectVisibleTodoItems,
  visibleTodoDate,
} from '../visibleTodoItems';

const recurringTodo: Todo = {
  id: '8e11fc00-a78f-4ee6-bd79-f7c886fb4f64',
  title: 'Daily review',
  notes: '',
  categoryId: null,
  priority: 'none',
  status: 'open',
  timing: {
    kind: 'timed',
    startAt: new Date('2026-07-26T01:00:00.000Z'),
    dueAt: new Date('2026-07-26T01:30:00.000Z'),
    timezone: 'Asia/Shanghai',
  },
  reminders: [],
  recurrence: { frequency: 'daily', interval: 1, end: { kind: 'never' } },
  completedAt: null,
  version: 1,
};

describe('visible todo items', () => {
  it('expands recurring todos and applies occurrence completion state', () => {
    const state: OccurrenceState = {
      todoId: recurringTodo.id,
      occurrenceKey: '2026-07-27T09:00:00',
      status: 'completed',
      completedAt: new Date('2026-07-27T02:00:00.000Z'),
      version: 1,
    };
    const items = selectVisibleTodoItems([recurringTodo], [state], {
      start: new Date('2026-07-25T16:00:00.000Z'),
      end: new Date('2026-07-28T16:00:00.000Z'),
    });

    expect(items).toHaveLength(3);
    expect(items.map((item) => [item.occurrenceKey, item.status])).toEqual([
      ['2026-07-26T09:00:00', 'open'],
      ['2026-07-27T09:00:00', 'completed'],
      ['2026-07-28T09:00:00', 'open'],
    ]);
    expect(visibleTodoDate(items[1]!, 'Asia/Shanghai')).toBe('2026-07-27');
  });

  it('stably partitions completed items after unfinished items', () => {
    const items = selectVisibleTodoItems(
      [recurringTodo],
      [
        {
          todoId: recurringTodo.id,
          occurrenceKey: '2026-07-27T09:00:00',
          status: 'completed',
          completedAt: new Date('2026-07-27T02:00:00.000Z'),
          version: 1,
        },
        {
          todoId: recurringTodo.id,
          occurrenceKey: '2026-07-28T09:00:00',
          status: 'cancelled',
          completedAt: null,
          version: 1,
        },
      ],
      {
        start: new Date('2026-07-25T16:00:00.000Z'),
        end: new Date('2026-07-28T16:00:00.000Z'),
      },
    );

    const originalKeys = items.map((item) => item.key);
    const sections = partitionVisibleTodoItemsByCompletion(items);

    expect(sections.unfinished.map((item) => [item.occurrenceKey, item.status])).toEqual([
      ['2026-07-26T09:00:00', 'open'],
      ['2026-07-28T09:00:00', 'cancelled'],
    ]);
    expect(sections.completed.map((item) => [item.occurrenceKey, item.status])).toEqual([
      ['2026-07-27T09:00:00', 'completed'],
    ]);
    expect([...sections.unfinished, ...sections.completed].map((item) => item.key)).toEqual([
      originalKeys[0],
      originalKeys[2],
      originalKeys[1],
    ]);
  });

  it('keeps an all-completed day available for the completed section', () => {
    const completedTodo: Todo = {
      ...recurringTodo,
      recurrence: null,
      status: 'completed',
      completedAt: new Date('2026-07-26T02:00:00.000Z'),
    };
    const items = selectVisibleTodoItems([completedTodo], [], {
      start: new Date('2026-07-25T16:00:00.000Z'),
      end: new Date('2026-07-27T16:00:00.000Z'),
    });

    expect(partitionVisibleTodoItemsByCompletion(items)).toEqual({
      unfinished: [],
      completed: items,
    });
  });

  it('sorts all-day items before timed items', () => {
    const timed = selectVisibleTodoItems([{ ...recurringTodo, recurrence: null }], [], {
      start: new Date('2026-07-25T16:00:00.000Z'),
      end: new Date('2026-07-27T16:00:00.000Z'),
    })[0]!;
    const allDayTodo: Todo = {
      ...recurringTodo,
      id: '655535dd-a4b1-4a38-84e7-0552f5f03fa8',
      title: 'Holiday',
      recurrence: null,
      timing: {
        kind: 'allDay',
        startDate: '2026-07-26',
        endDateExclusive: '2026-07-27',
        timezone: 'Asia/Shanghai',
      },
    };
    const allDay = selectVisibleTodoItems([allDayTodo], [], {
      start: new Date('2026-07-25T16:00:00.000Z'),
      end: new Date('2026-07-27T16:00:00.000Z'),
    })[0]!;

    expect([timed, allDay].sort(compareVisibleTodoItems).map((item) => item.todo.title)).toEqual([
      'Holiday',
      'Daily review',
    ]);
  });
});
