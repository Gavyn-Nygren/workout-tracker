import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { readable } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

/**
 * Shared screen states (G2.11). Every screen checks them in the same order:
 * error → loading → not found → empty → content.
 */

/** Centers a whole-screen state. Transparent, so it matches screens and sheets alike. */
export function ScreenState({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

type ErrorStateProps = {
  /** "Couldn't load {thing}". */
  title: string;
  message?: string;
  onRetry: () => void;
  /** Fill the screen (whole-screen error) instead of sitting inline in a section. */
  fill?: boolean;
};

/** A load failed. Data is local-first, so the message reassures that nothing is lost. */
export function ErrorState({ title, message = 'Your data is still saved on this phone.', onRetry, fill }: ErrorStateProps) {
  const body = <EmptyState icon="exclamationmark.triangle" title={title} message={message} actionLabel="Try again" onAction={onRetry} />;
  return fill ? <ScreenState>{body}</ScreenState> : body;
}

type NotFoundProps = {
  /** "Plan", "Workout", "Exercise"… The title reads "{thing} not found". */
  thing: string;
  icon: SFSymbol;
  /** "Back" on pushed screens, "Close" in modals and sheets. */
  backLabel?: 'Back' | 'Close';
  onBack?: () => void;
};

/** The item a screen was opened for doesn't exist (deleted, or a stale link). */
export function NotFoundState({ thing, icon, backLabel = 'Back', onBack = () => router.back() }: NotFoundProps) {
  return (
    <ScreenState>
      <EmptyState icon={icon} title={`${thing} not found`} message="It may have been deleted." actionLabel={backLabel} onAction={onBack} />
    </ScreenState>
  );
}

/** Placeholder for a detail screen while it loads: a title bar and two cards. */
export function ScreenSkeleton({ hero }: { hero?: boolean }) {
  return (
    <View style={styles.skeleton} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <View style={[styles.skeletonBody, readable]}>
        {hero ? <Skeleton height={200} radius={radius.card + 4} /> : <Skeleton width="55%" height={28} />}
        <Skeleton height={120} radius={radius.card} />
        <Skeleton height={180} radius={radius.card} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  skeleton: {
    flex: 1,
    padding: spacing.lg,
  },
  skeletonBody: {
    gap: spacing.lg,
  },
});
