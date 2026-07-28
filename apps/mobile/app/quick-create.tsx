import { useLocalSearchParams } from 'expo-router';

import { QuickCreateScreen } from '@/features/todos/QuickCreateScreen';
import { normalizeQuickCreateDateParam } from '@/features/todos/quickCreateParams';

export default function QuickCreateRoute() {
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  return <QuickCreateScreen initialDate={normalizeQuickCreateDateParam(date)} />;
}
