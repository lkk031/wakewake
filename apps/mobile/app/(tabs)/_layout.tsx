import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useAppTheme } from '@/theme/useAppTheme';

const icons = {
  calendar: ['calendar-outline', 'calendar'],
  agenda: ['list-outline', 'list'],
  inbox: ['file-tray-outline', 'file-tray'],
  settings: ['options-outline', 'options'],
} as const;

export default function TabLayout() {
  const theme = useAppTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarStyle: {
          backgroundColor: theme.color.tabBar,
          borderTopColor: theme.color.border,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 7,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          paddingBottom: Platform.OS === 'ios' ? 0 : 8,
        },
        tabBarIcon: ({ color, focused, size }) => {
          const key = route.name as keyof typeof icons;
          const pair = icons[key] ?? icons.calendar;
          return <Ionicons name={focused ? pair[1] : pair[0]} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="calendar" options={{ title: '日历' }} />
      <Tabs.Screen name="agenda" options={{ title: '议程' }} />
      <Tabs.Screen name="inbox" options={{ title: '收集箱' }} />
      <Tabs.Screen name="settings" options={{ title: '设置' }} />
    </Tabs>
  );
}
