import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View, type TextInputInstance, type ViewInstance } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { firstParam } from '@/lib/params';
import { reportFormErrors, TextFieldWithRef } from '@/features/auth/formErrors';
import { EMAIL_PATTERN } from '@/features/auth/validation';
import { readable } from '@/theme/layout';

/** Password reset by email link (spec 2.3). Sending is mocked until Supabase Auth (G5.1). */
export default function ResetPasswordScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  // A link can repeat the key (an array) or leave it out.
  const [email, setEmail] = useState(() => firstParam(params.email));
  const [sent, setSent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const sentTitle = useRef<ViewInstance>(null);
  const error = !EMAIL_PATTERN.test(email.trim()) ? 'Enter the email on your account.' : undefined;

  // The pressed button is gone once the link is sent, so VoiceOver moves to the confirmation.
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => sentTitle.current && AccessibilityInfo.sendAccessibilityEvent(sentTitle.current, 'focus'), 150);
    return () => clearTimeout(t);
  }, [sent]);

  if (sent) {
    return (
      // Scrolls at large text sizes so "Back to sign in" stays reachable.
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.sent}>
        <View style={[styles.icon, { backgroundColor: colors.successSubtle }]}>
          <Icon name="checkmark" color={colors.successText} size={30} weight="bold" />
        </View>
        <View ref={sentTitle} accessible accessibilityRole="header" accessibilityLabel="Reset link sent">
          <AppText variant="title2" style={styles.center}>
            Reset link sent
          </AppText>
        </View>
        <AppText variant="body" tone="secondary" style={styles.center}>
          {`If ${email.trim()} has an account, a link to set a new password is on its way. It expires in an hour.`}
        </AppText>
        <Button title="Back to sign in" fullWidth onPress={() => router.back()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <AppText variant="title1" accessibilityRole="header">
        Reset your password
      </AppText>
      <AppText variant="body" tone="secondary">
        We'll email you a link to choose a new one.
      </AppText>
      <TextFieldWithRef
        ref={emailRef}
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
          if (!reportFormErrors([{ error, ref: emailRef }])) setSent(true);
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
    flexGrow: 1,
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
