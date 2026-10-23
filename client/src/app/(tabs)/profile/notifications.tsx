import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ListRow, SectionHeader, SegmentedControl, Toggle } from '@/components/ui';
import type { Preferences, Weekday } from '@/data/types';
import { dateToTime, timeToDate, useSettings } from '@/features/settings/useSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Toggles = 'workoutReminders' | 'restTimer' | 'missedWorkout' | 'weeklySummary' | 'formAnalysisComplete';

const ROWS: { key: Toggles; title: string; subtitle: string; icon: 'calendar' | 'timer' | 'calendar.badge.exclamationmark' | 'chart.bar' | 'video' }[] = [
  { key: 'workoutReminders', title: 'Workout reminders', subtitle: 'On days with a planned workout', icon: 'calendar' },
  { key: 'restTimer', title: 'Rest timer alarm', subtitle: 'When rest ends and the app is in the background', icon: 'timer' },
  { key: 'missedWorkout', title: 'Missed workout', subtitle: 'The morning after, with the option to shift your plan', icon: 'calendar.badge.exclamationmark' },
  { key: 'weeklySummary', title: 'Weekly summary', subtitle: 'Workouts, volume, PRs, and your streak', icon: 'chart.bar' },
  { key: 'formAnalysisComplete', title: 'Form analysis ready', subtitle: 'When a recording finishes analyzing', icon: 'video' },
];

/**
 * Opt-in notification categories with times and quiet hours (spec 2.11). iOS permission is
 * requested the first time one is turned on (explainer screen: G2.9; delivery: G3.12).
 */
export default function NotificationsScreen() {
  const { colors, scheme } = useAppTheme();
  const { preferences, update } = useSettings();
  const n = preferences.notifications;
  const set = (patch: Partial<Preferences['notifications']>) => update((p) => ({ ...p, notifications: { ...p.notifications, ...patch } }));

  // The first time one is turned on, explain before iOS asks (spec 2.11).
  const toggle = async (key: Toggles, on: boolean) => {
    if (!on) return set({ [key]: false });
    const permission = await Notifications.getPermissionsAsync().catch(() => undefined);
    if (permission?.granted) set({ [key]: true });
    else router.push({ pathname: '/notifications-permission', params: { key } });
  };

  const picker = (value: string, onChange: (time: string) => void, label: string) => (
    <DateTimePicker
      value={timeToDate(value)}
      mode="time"
      display="compact"
      minuteInterval={5}
      themeVariant={scheme}
      accentColor={colors.accentText}
      accessibilityLabel={label}
      onChange={(_, date) => date && onChange(dateToTime(date))}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AppText variant="subhead" tone="secondary" style={styles.hint}>
        Everything is off until you turn it on; iOS asks for permission the first time. Lock-screen alerts show workout names unless iOS "Show Previews" is off.
      </AppText>

      <Card padding="none">
        {ROWS.map((row, i) => (
          <View key={row.key}>
            <ListRow
              title={row.title}
              subtitle={row.subtitle}
              icon={row.icon}
              trailing={<Toggle label={row.title} value={n[row.key]} onChange={(v) => toggle(row.key, v)} />}
              separator={i < ROWS.length - 1 || (row.key === 'weeklySummary' && n.weeklySummary)}
            />
            {row.key === 'workoutReminders' && n.workoutReminders && (
              <View style={[styles.sub, { borderBottomColor: colors.border }]}>
                <AppText variant="subhead" tone="secondary" style={styles.flex}>
                  Remind me at
                </AppText>
                {picker(n.reminderTime, (reminderTime) => set({ reminderTime }), 'Reminder time')}
              </View>
            )}
            {row.key === 'weeklySummary' && n.weeklySummary && (
              <View style={[styles.subStack, { borderBottomColor: colors.border }]}>
                <SegmentedControl
                  label="Weekly summary day"
                  options={[
                    { value: '7', label: 'Sunday' },
                    { value: '1', label: 'Monday' },
                  ]}
                  value={String(n.weeklySummaryAt.weekday) as '7' | '1'}
                  onChange={(d) => set({ weeklySummaryAt: { ...n.weeklySummaryAt, weekday: Number(d) as Weekday } })}
                />
                <View style={styles.inline}>
                  <AppText variant="subhead" tone="secondary" style={styles.flex}>
                    At
                  </AppText>
                  {picker(n.weeklySummaryAt.time, (time) => set({ weeklySummaryAt: { ...n.weeklySummaryAt, time } }), 'Weekly summary time')}
                </View>
              </View>
            )}
          </View>
        ))}
      </Card>

      <View style={styles.section}>
        <SectionHeader title="Quiet hours" />
        <Card padding="none">
          <ListRow
            title="Quiet hours"
            subtitle="Hold notifications overnight; they arrive afterward"
            icon="moon"
            trailing={<Toggle label="Quiet hours" value={Boolean(n.quietHours)} onChange={(on) => set({ quietHours: on ? { start: '22:00', end: '07:00' } : undefined })} />}
            separator={Boolean(n.quietHours)}
          />
          {n.quietHours && (
            <>
              <View style={[styles.sub, { borderBottomColor: colors.border }]}>
                <AppText variant="subhead" tone="secondary" style={styles.flex}>
                  From
                </AppText>
                {picker(n.quietHours.start, (start) => set({ quietHours: { ...n.quietHours!, start } }), 'Quiet hours start')}
              </View>
              <View style={[styles.sub, { borderBottomWidth: 0 }]}>
                <AppText variant="subhead" tone="secondary" style={styles.flex}>
                  Until
                </AppText>
                {picker(n.quietHours.end, (end) => set({ quietHours: { ...n.quietHours!, end } }), 'Quiet hours end')}
              </View>
            </>
          )}
        </Card>
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          A rest timer you started still alerts during quiet hours.
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg + 30 + spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subStack: {
    gap: spacing.sm,
    paddingLeft: spacing.lg + 30 + spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});
