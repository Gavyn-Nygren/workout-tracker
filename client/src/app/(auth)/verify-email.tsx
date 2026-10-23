import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, useToast } from '@/components/ui';
import { signIn } from '@/features/auth/authStore';
import { useAppTheme } from '@/theme/ThemeProvider';
import { readable } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

const RESEND_SECONDS = 30;

/** "Check your inbox" after sign-up (spec 2.3: email verification is required). */
export default function VerifyEmailScreen() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const { email, name } = useLocalSearchParams<{ email: string; name?: string }>();
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.body, readable]}>
        <View style={[styles.icon, { backgroundColor: colors.accentSubtle }]}>
          <Icon name="envelope.badge.fill" color={colors.accentText} size={34} />
        </View>
        <AppText variant="title1" style={styles.center}>
          Check your inbox
        </AppText>
        <AppText variant="body" tone="secondary" style={styles.center}>
          {`We sent a link to ${email}. Tap it to verify your email, then come back here.`}
        </AppText>
        <View style={styles.buttons}>
          <Button title="Open Mail" icon="envelope.open" fullWidth onPress={() => Linking.openURL('message://').catch(() => toast.show({ message: "Couldn't open Mail." }))} />
          <Button
            title="I've verified my email"
            variant="secondary"
            fullWidth
            // Mock: verification is confirmed by the server in G5.1.
            onPress={() => signIn('email', { email, name, isNewAccount: true })}
          />
          <Button
            title={cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
            variant="ghost"
            disabled={cooldown > 0}
            onPress={() => {
              setCooldown(RESEND_SECONDS);
              toast.show({ message: `Sent another link to ${email}.`, tone: 'success' });
            }}
            style={styles.centerSelf}
          />
          <Button title="Use a different email" variant="ghost" size="sm" onPress={() => router.back()} style={styles.centerSelf} />
        </View>
        <AppText variant="footnote" tone="tertiary" style={styles.center}>
          Can't find it? Check spam, or make sure the address is right.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  body: {
    gap: spacing.md,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  center: {
    textAlign: 'center',
  },
  centerSelf: {
    alignSelf: 'center',
  },
  buttons: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
