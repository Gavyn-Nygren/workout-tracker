import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText, Button, Card, ListRow, TextField, Toggle } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { EMAIL_PATTERN } from '@/features/auth/validation';

/** Create an account with email. The 16+ age requirement is confirmed here (spec 2.3). */
export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oldEnough, setOldEnough] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emailError = !EMAIL_PATTERN.test(email.trim()) ? 'Enter a valid email address.' : undefined;
  const passwordError = password.length < 8 ? 'Use at least 8 characters.' : undefined;
  const ageError = !oldEnough ? 'You need to be 16 or older to create an account.' : undefined;

  const submit = () => {
    setSubmitted(true);
    if (emailError || passwordError || ageError) return;
    router.push({ pathname: '/verify-email', params: { email: email.trim(), name: name.trim() } });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <AppText variant="title1">Create your account</AppText>
      <TextField label="First name (optional)" value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        error={submitted ? emailError : undefined}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        passwordRules="minlength: 8;"
        hint={!submitted || !passwordError ? 'At least 8 characters. iOS can suggest a strong one.' : undefined}
        error={submitted ? passwordError : undefined}
      />
      <Card padding="none">
        <ListRow title="I'm 16 or older" subtitle="Required to use the app" trailing={<Toggle label="I'm 16 or older" value={oldEnough} onChange={setOldEnough} />} separator={false} />
      </Card>
      {submitted && ageError && (
        <AppText variant="footnote" tone="error">
          {ageError}
        </AppText>
      )}
      <AppText variant="footnote" tone="secondary">
        By creating an account you agree to the Terms and Privacy Policy. Your form videos never leave your phone.
      </AppText>
      <Button title="Create account" fullWidth onPress={submit} />
      <Button title="Already have an account? Sign in" variant="ghost" onPress={() => router.replace('/sign-in')} style={styles.center} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  center: {
    alignSelf: 'center',
  },
});
