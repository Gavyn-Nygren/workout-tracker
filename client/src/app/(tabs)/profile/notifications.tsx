import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, ListRow, SectionHeader, SegmentedControl, Toggle } from '@/components/ui';
import type { NotificationToggle, Preferences, Weekday } from '@/data/types';
import { reminderQuietEffect } from '@/features/notifications/localTime';
import { PLAN_OFFER_KINDS } from '@/features/notifications/planOffer';
import { markPlanOfferAsked } from '@/features/notifications/planOfferStore';
import { summaryCoverageCaption } from '@/features/notifications/summaryTiming';
import { dateToTime, formatTime, timeToDate, useSettings } from '@/features/settings/useSettings';
import { markRestAlarmAsked, refreshNotificationPermission, useNotificationPermission } from '@/features/workout/useRestAlarm';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

const ROWS: { key: NotificationToggle; title: string; subtitle: string; icon: 'calendar' | 'timer' | 'calendar.badge.exclamationmark' | 'chart.bar' | 'video' }[] = [
  { key: 'workoutReminders', title: 'Workout reminders', subtitle: 'On days with a planned workout', icon: 'calendar' },
  { key: 'restTimer', title: 'Rest timer alarm', subtitle: 'When rest ends and the app is in the background', icon: 'timer' },
  { key: 'missedWorkout', title: 'Missed workout', subtitle: 'The morning after, with the option to shift your plan', icon: 'calendar.badge.exclamationmark' },
  { key: 'weeklySummary', title: 'Weekly summary', subtitle: 'Workouts, volume, PRs, and your streak', icon: 'chart.bar' },
  // Saved, but nothing sends it until form analysis is real (roadmap G4.5).
  { key: 'formAnalysisComplete', title: 'Form analysis ready', subtitle: 'Comes with form analysis in a later update', icon: 'video' },
];

const isPlanOfferKind = (key: NotificationToggle) => (PLAN_OFFER_KINDS as readonly string[]).includes(key);

/** What quiet hours do to a reminder at this time, under the time picker; null when nothing. */
function quietHint(time: string, quiet: Preferences['notifications']['quietHours']): string | null {
  const effect = reminderQuietEffect(time, quiet);
  if (effect.kind === 'held') return `That’s during quiet hours, so reminders arrive at ${formatTime(effect.until)}.`;
  if (effect.kind === 'dropped') return 'That’s during quiet hours, so reminders won’t be sent. Pick a time outside them.';
  return null;
}

/**
 * Opt-in notification categories with times and quiet hours (spec 2.11). iOS permission is
 * requested the first time one is turned on (explainer screen: G2.9; delivery: G3.12). With
 * notifications off in iOS Settings, a row at the top says so; the toggles keep their values.
 */
export default function NotificationsScreen() {
  const { colors, scheme } = useAppTheme();
  const { preferences, update } = useSettings();
  const { large } = useTextScale();
  const permission = useNotificationPermission();
  const n = preferences.notifications;
  // At accessibility sizes the time pickers go under their labels so neither gets squeezed.
  const sub = large ? [styles.subStack, styles.stacked] : styles.sub;
  const set = (patch: Partial<Preferences['notifications']>) => update((p) => ({ ...p, notifications: { ...p.notifications, ...patch } }));
  const reminderHint = quietHint(n.reminderTime, n.quietHours);
  const coverage = summaryCoverageCaption(n.weeklySummaryAt.weekday, preferences.weekStartsOn);

  // The row at the top follows iOS Settings, which can change while the app is away.
  useEffect(() => {
    void refreshNotificationPermission();
  }, []);

  // The first time one is turned on, explain before iOS asks (spec 2.11).
  const toggle = async (key: NotificationToggle, on: boolean) => {
    // Choosing here, either way, means the first rest of a workout won't offer the alarm again,
    // and a first plan won't offer reminders.
    if (key === 'restTimer') markRestAlarmAsked();
    if (isPlanOfferKind(key)) markPlanOfferAsked();
    if (!on) return set({ [key]: false });
    if ((await refreshNotificationPermission()) === 'granted') set({ [key]: true });
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
      onValueChange={(_, date) => onChange(dateToTime(date))}
    />
  );

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]}>
      {permission === 'denied' && (
        <Card>
          <View style={large ? styles.offStacked : styles.off}>
            <View style={[styles.offIcon, { backgroundColor: colors.input }]}>
              <Icon name="bell.slash" color={colors.textSecondary} size={16} />
            </View>
            <View style={styles.offText} accessible accessibilityRole="text">
              <AppText variant="headline">Notifications are off in iOS Settings</AppText>
              <AppText variant="footnote" tone="secondary">
                Your choices here are kept. Allow notifications in iOS Settings to get them.
              </AppText>
            </View>
          </View>
          <Button title="Open Settings" variant="secondary" size="sm" accessibilityHint="Opens iOS Settings, where notifications can be allowed" onPress={() => Linking.openSettings()} style={[styles.offButton, !large && styles.offButtonIndent]} />
        </Card>
      )}

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
              <View style={[large ? styles.subStack : styles.subGroup, { borderBottomColor: colors.border }]}>
                <View style={large ? styles.stacked : styles.inlineRow}>
                  <AppText variant="subhead" tone="secondary" style={!large && styles.flex}>
                    Remind me at
                  </AppText>
                  {picker(n.reminderTime, (reminderTime) => set({ reminderTime }), 'Reminder time')}
                </View>
                {reminderHint && (
                  <AppText variant="footnote" tone="secondary" accessibilityLiveRegion="polite">
                    {reminderHint}
                  </AppText>
                )}
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
                <AppText variant="footnote" tone="secondary" accessibilityLabel={coverage.replace('–', ' to ')} accessibilityLiveRegion="polite">
                  {coverage}
                </AppText>
                <View style={large ? styles.stacked : styles.inline}>
                  <AppText variant="subhead" tone="secondary" style={!large && styles.flex}>
                    At
                  </AppText>
                  {picker(n.weeklySummaryAt.time, (time) => set({ weeklySummaryAt: { ...n.weeklySummaryAt, time } }), 'Weekly summary time')}
                </View>
              </View>
            )}
          </View>
        ))}
      </Card>

      {/* The summary screen works out the week live, whether or not the notification is on. */}
      <Card padding="none">
        <ListRow
          title="See latest summary"
          icon="chart.bar.xaxis"
          accessibilityHint="Opens your week: workouts, volume, PRs, and your streak"
          onPress={() => router.push('/weekly-summary')}
          separator={false}
        />
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
              <View style={[sub, { borderBottomColor: colors.border }]}>
                <AppText variant="subhead" tone="secondary" style={!large && styles.flex}>
                  From
                </AppText>
                {picker(n.quietHours.start, (start) => set({ quietHours: { ...n.quietHours!, start } }), 'Quiet hours start')}
              </View>
              <View style={[sub, { borderBottomWidth: 0 }]}>
                <AppText variant="subhead" tone="secondary" style={!large && styles.flex}>
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
  subGroup: {
    gap: spacing.xs,
    paddingLeft: spacing.lg + 30 + spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  stacked: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  off: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  offStacked: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  offIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offText: {
    flexShrink: 1,
    gap: 2,
  },
  offButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  // Lines up with the text beside the icon.
  offButtonIndent: {
    marginLeft: 30 + spacing.md,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});
