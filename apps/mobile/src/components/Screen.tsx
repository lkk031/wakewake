import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/useAppTheme';

interface ScreenProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  scroll?: boolean;
}

export function Screen({ eyebrow, title, subtitle, action, children, scroll = true }: ScreenProps) {
  const theme = useAppTheme();
  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.heading}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: theme.color.accent }]}>{eyebrow}</Text>
          ) : null}
          <Text accessibilityRole="header" style={[styles.title, { color: theme.color.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.color.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.color.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        <View style={styles.content}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 18,
    marginBottom: 24,
  },
  heading: { flex: 1, paddingRight: 16 },
  eyebrow: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 7 },
});
