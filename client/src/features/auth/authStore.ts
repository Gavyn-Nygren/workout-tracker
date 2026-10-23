import { createLocalStore } from '@/lib/localStore';

export type AuthMethod = 'apple' | 'email';

type AuthState = {
  signedIn: boolean;
  /** False until onboarding is finished or skipped (spec 2.4: onboarding is optional). */
  onboarded: boolean;
  method: AuthMethod;
  name: string;
  email?: string;
};

/**
 * Mock session kept on the phone until Supabase Auth (roadmap G5.1). Starts signed in and
 * onboarded so the app opens normally; Sign out in Profile walks through the real flow.
 */
export const authStore = createLocalStore<AuthState>('auth.mock', {
  signedIn: true,
  onboarded: true,
  method: 'apple',
  name: 'Gavyn',
});

export function signIn(method: AuthMethod, profile: { name?: string; email?: string; isNewAccount?: boolean }) {
  authStore.set((s) => ({
    ...s,
    signedIn: true,
    method,
    name: profile.name || s.name,
    email: profile.email ?? s.email,
    // New accounts go through onboarding; returning ones keep what they had.
    onboarded: profile.isNewAccount ? false : s.onboarded,
  }));
}

export function signOut() {
  authStore.set((s) => ({ ...s, signedIn: false }));
}

export function completeOnboarding() {
  authStore.set((s) => ({ ...s, onboarded: true }));
}

/** Developer helper: see the app as a brand-new user would. */
export function resetFirstRun() {
  authStore.set((s) => ({ ...s, signedIn: false, onboarded: false }));
}
