import { useLocalSearchParams } from 'expo-router';

import { EditTodoScreen } from '@/features/todos/EditTodoScreen';

export default function TodoRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditTodoScreen id={id} />;
}
