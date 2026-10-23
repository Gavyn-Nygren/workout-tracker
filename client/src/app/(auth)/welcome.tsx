import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, useToast } from '@/components/ui';
import { signIn } from '@/features/auth/authStore';
import { SkeletonFigure, useRepLoop } from '@/features/form/SkeletonFigure';
import { SchemeOverride } from '@/theme/ThemeProvider';
import { DENSE_TEXT_MAX, readable, READABLE_MAX, useTextScale } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

/**
 * Welcome (user's pick: dark hero with the lifter). Apple's own button keeps Sign in with Apple
 * within Apple's design rules; email is the alternative (spec 2.3).
 */
export default function WelcomeScreen() {
  return (
    <SchemeOverride scheme="dark">
      <Welcome />
    </SchemeOverride>
  );
}

function Welcome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { large } = useTextScale();
  const toast = useToast();
  const loop = useRepLoop({ playing: true, repSeconds: 3.2 });
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const signInWithApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      // Apple only shares the name on the first sign-in; the server (G5.1) will remember it.
      signIn('apple', { name: credential.fullName?.givenName ?? undefined, email: credential.email ?? undefined });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      toast.show({ message: "Couldn't sign in with Apple. Try again, or use email.", tone: 'error' });
    }
  };

  // The lifter is decoration, so it shrinks at accessibility text sizes to leave room for the words and buttons.
  const figure = large ? Math.min(height * 0.2, 160) : Math.min(height * 0.36, 300);

  return (
    // Scrolls when the text is too big to fit, so the sign-in buttons are always reachable.
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.top, readable]}>
        <AppText variant="label" tone="accent">
          Exercise Tracker
        </AppText>
        <AppText style={styles.headline} accessibilityRole="header" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          {'Lift. Log.\nSee your form improve.'}
        </AppText>
        <AppText variant="body" tone="secondary">
          Plans, fast logging, progress, and on-device form analysis for independent lifters.
        </AppText>
      </View>

      <View style={[styles.figure, readable]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SkeletonFigure family="squat" depth={loop.depth} withBar width={Math.min(width - spacing.xl * 2, READABLE_MAX)} height={figure} />
      </View>

      <View style={[styles.buttons, readable]}>
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.pill}
            style={styles.apple}
            onPress={signInWithApple}
          />
        )}
        <Button title="Continue with email" variant="secondary" icon="envelope.fill" fullWidth onPress={() => router.push('/sign-in')} />
        <Button title="New here? Create an account" variant="ghost" onPress={() => router.push('/sign-up')} style={styles.center} />
        <AppText variant="caption" tone="secondary" style={styles.legal}>
          {`You must be 16 or older. By continuing you agree to the Terms and Privacy Policy.`}
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05080B',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
    gap: spacing.xl,
  },
  top: {
    gap: spacing.sm,
  },
  headline: {
    fontSize: 36,
    lineHeight: 41,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  figure: {
    alignItems: 'center',
  },
  buttons: {
    gap: spacing.sm,
  },
  apple: {
    height: 50,
    width: '100%',
  },
  center: {
    alignSelf: 'center',
  },
  legal: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
