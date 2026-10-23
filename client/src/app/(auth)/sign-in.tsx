import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppText, Button, TextField } from '@/components/ui';
import { signIn } from '@/features/auth/authStore';
import { EMAIL_PATTERN } from '@/features/auth/validation';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/** Email sign-in. Fields are tagged so iOS offers saved passwords (spec 2.3: credential autofill). */
export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailError = !EMAIL_PATTERN.test(email.trim()) ? 'Enter the email you signed up with.' : undefined;
  const passwordError = password.length < 8 ? 'Passwords are at least 8 characters.' : undefined;

  const submit = () => {
    setSubmitted(true);
    if (emailError || passwordError) return;
    setLoading(true);
    // Mock: any well-formed email and password signs in until Supabase Auth (G5.1).
    setTimeout(() => signIn('email', { email: email.trim() }), 500);
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <AppText variant="title1">Welcome back</AppText>
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
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        error={submitted ? passwordError : undefined}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Forgot password?" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/reset-password', params: { email } })} />
      <Button title="Sign in" fullWidth loading={loading} onPress={submit} />
      <Button title="New here? Create an account" variant="ghost" onPress={() => router.replace('/sign-up')} style={styles.center} />
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
