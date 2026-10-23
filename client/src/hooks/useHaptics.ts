import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';

import { usePreferences } from '@/data/hooks';

/**
 * Haptic vocabulary for the app (spec 2.13): a light tap when a set is completed,
 * a stronger cue when the rest timer ends. All of it respects the Settings toggle.
 */
export function useHaptics() {
  const { data: preferences } = usePreferences();
  const enabled = preferences?.haptics ?? true;

  return useMemo(() => {
    const run = (fn: () => Promise<void>) => () => {
      if (enabled) fn().catch(() => {});
    };
    return {
      /** Set completed, small confirmations. */
      tap: run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
      /** Picker and segmented-control changes. */
      selection: run(() => Haptics.selectionAsync()),
      /** Rest timer finished. */
      timerEnd: run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
      /** Personal record, workout finished. */
      success: run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
      warning: run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
      error: run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
    };
  }, [enabled]);
}
