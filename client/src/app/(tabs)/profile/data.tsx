import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ListRow, SectionHeader, useToast } from '@/components/ui';
import { todayISO } from '@/data/dates';
import { useBodyweight, useExercises, useFormReports, useGoals, usePlans, useSessions } from '@/data/hooks';
import { everythingJson, workoutsCsv } from '@/features/settings/exportData';
import { shareText } from '@/features/settings/shareFile';
import { authStore, signOut } from '@/features/auth/authStore';
import { useSettings } from '@/features/settings/useSettings';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/** Data export, sign-in, and account deletion (spec 2.3). */
export default function DataAccountScreen() {
  const toast = useToast();
  const { preferences } = useSettings();
  const auth = authStore.use();
  const queries = { sessions: useSessions(), exercises: useExercises(), plans: usePlans(), bodyweight: useBodyweight(), goals: useGoals(), formReports: useFormReports() };
  const sessions = queries.sessions.data;
  const { data: exercises } = queries.exercises;
  const { data: plans } = queries.plans;
  const { data: bodyweight } = queries.bodyweight;
  const { data: goals } = queries.goals;
  const { data: formReports } = queries.formReports;
  // Export only once everything has loaded, so the file is never missing data.
  const all = Object.values(queries);
  const ready = all.every((q) => q.data !== undefined);
  const loadFailed = !ready && all.some((q) => q.error);
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null);

  const run = async (kind: 'csv' | 'json') => {
    const stamp = todayISO();
    if (!ready) {
      if (loadFailed) {
        all.forEach((q) => q.error && q.refetch());
        toast.show({ message: "Couldn't load your data to export. Try again.", tone: 'error' });
      }
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'csv') {
        const byId = new Map((exercises ?? []).map((e) => [e.id, e]));
        await shareText(`workouts-${stamp}.csv`, workoutsCsv(sessions ?? [], byId, plans ?? [], preferences.units), 'text/csv');
      } else {
        await shareText(
          `exercise-tracker-${stamp}.json`,
          everythingJson({ preferences, exercises: exercises ?? [], plans: plans ?? [], sessions: sessions ?? [], bodyweight: bodyweight ?? [], goals: goals ?? [], formReports: formReports ?? [] }),
          'application/json',
        );
      }
    } catch {
      toast.show({ message: "Couldn't export your data. Try again.", tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const completed = (sessions ?? []).filter((s) => s.status === 'completed').length;

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]}>
      <View style={styles.section}>
        <SectionHeader title="Export your data" />
        <Card padding="none">
          {/* Exports wait for every query, so a file is never missing data. */}
          <ListRow
            title={busy === 'csv' ? 'Preparing…' : 'Workouts as CSV'}
            subtitle={loadFailed ? "Couldn't load your workouts. Tap to try again." : ready ? `Every logged set from ${completed} workouts, for spreadsheets` : 'Loading your workouts…'}
            icon="tablecells"
            onPress={() => !busy && run('csv')}
          />
          <ListRow
            title={busy === 'json' ? 'Preparing…' : 'Everything as JSON'}
            subtitle={loadFailed ? "Couldn't load your data. Tap to try again." : ready ? 'Plans, workouts, bodyweight, goals, and form metrics' : 'Loading your data…'}
            icon="doc.text"
            onPress={() => !busy && run('json')}
            separator={false}
          />
        </Card>
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          Opens the share sheet so you can save to Files, AirDrop, or email it. Videos aren't included; export them from each form report.
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Account" />
        <Card padding="none">
          <ListRow title="Sign-in method" value={auth.method === 'apple' ? 'Apple' : 'Email'} subtitle={auth.method === 'email' ? auth.email : undefined} icon={auth.method === 'apple' ? 'apple.logo' : 'envelope'} />
          <ListRow
            title="Sign out"
            icon="rectangle.portrait.and.arrow.right"
            onPress={() =>
              Alert.alert('Sign out?', 'Anything not yet synced stays on this phone and uploads when you sign back in.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: signOut },
              ])
            }
          />
          <ListRow title="Delete account" icon="trash" destructive onPress={() => router.push('/profile/delete-account')} separator={false} />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
});
