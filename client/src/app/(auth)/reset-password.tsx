import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, TextField } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { EMAIL_PATTERN } from '@/features/auth/validation';

/** Password reset by email link (spec 2.3). Sending is mocked until Supabase Auth (G5.1). */
export default function ResetPasswordScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const error = !EMAIL_PATTERN.test(email.trim()) ? 'Enter the email on your account.' : undefined;

  if (sent) {
    return (
      <View style={[styles.sent, { backgroundColor: colors.background }]}>
        <View style={[styles.icon, { backgroundColor: colors.successSubtle }]}>
          <Icon name="checkmark" color={colors.successText} size={30} weight="bold" />
        </View>
        <AppText variant="title2" style={styles.center}>
          Reset link sent
        </AppText>
        <AppText variant="body" tone="secondary" style={styles.center}>
          {`If ${email.trim()} has an account, a link to set a new password is on its way. It expires in an hour.`}
        </AppText>
        <Button title="Back to sign in" fullWidth onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <AppText variant="title1">Reset your password</AppText>
      <AppText variant="body" tone="secondary">
        We'll email you a link to choose a new one.
      </AppText>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        error={submitted ? error : undefined}
      />
      <Button
        title="Send reset link"
        fullWidth
        onPress={() => {
          setSubmitted(true);
          if (!error) setSent(true);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sent: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
