import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, TextField } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

const TIMELINE: { when: string; what: string; icon: SFSymbol }[] = [
  { when: 'Right away', what: "You're signed out and the account is deactivated. Form videos on this phone are deleted.", icon: 'person.crop.circle.badge.xmark' },
  { when: 'For 7 days', what: 'Changed your mind? Sign back in to restore everything.', icon: 'arrow.uturn.backward.circle' },
  { when: 'After 7 days', what: 'Your workouts, plans, goals, and form metrics are permanently deleted from our servers.', icon: 'trash.circle' },
  { when: 'Within 30 days', what: 'Copies in our encrypted backups expire too.', icon: 'externaldrive.badge.xmark' },
];

/** Account deletion with the 7-day grace period (spec 2.3). Connects to the server in G5.4. */
export default function DeleteAccountScreen() {
  const { colors } = useAppTheme();
  const [confirm, setConfirm] = useState('');
  const ready = confirm.trim().toUpperCase() === 'DELETE';

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <AppText variant="title2" accessibilityRole="header">
        What happens when you delete your account
      </AppText>
      <Card padding="none">
        {TIMELINE.map((step, i) => (
          <View
            key={step.when}
            style={[styles.step, i < TIMELINE.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            accessible
            accessibilityLabel={`${step.when}: ${step.what}`}
          >
            <Icon name={step.icon} color={i === 0 ? colors.errorText : colors.textSecondary} size={22} />
            <View style={styles.flex}>
              <AppText variant="headline">{step.when}</AppText>
              <AppText variant="subhead" tone="secondary">
                {step.what}
              </AppText>
            </View>
          </View>
        ))}
      </Card>
      <AppText variant="subhead" tone="secondary">
        Want a copy first? Export your data from Data & account before you continue.
      </AppText>
      <TextField label='Type "DELETE" to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" />
      <Button
        title="Delete my account"
        variant="destructive"
        icon="trash"
        fullWidth
        disabled={!ready}
        onPress={() =>
          Alert.alert('Preview only', "Account deletion connects to the server in roadmap G5.4. Nothing was deleted.", [{ text: 'OK', onPress: () => router.back() }])
        }
      />
      <AppText variant="footnote" tone="secondary" style={styles.center}>
        You'll confirm with Face ID or your password before anything is deleted.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
});
