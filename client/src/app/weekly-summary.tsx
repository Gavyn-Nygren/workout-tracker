import { router, useLocalSearchParams } from 'expo-router';

import { ErrorState, ScreenSkeleton } from '@/components/ui';
import { useWeeklySummary } from '@/features/weekly/useWeeklySummary';
import { WeeklySummaryView } from '@/features/weekly/WeeklySummaryView';

/**
 * "Your week" (roadmap G3.12, spec 2.11): what the weekly summary notification opens, also reached
 * from Profile → Notifications. `week` is any day of the week to show; without it, the week the
 * latest summary covered. It recomputes live, so it's never staler than the notification.
 */
export default function WeeklySummaryScreen() {
  const params = useLocalSearchParams<{ week?: string }>();
  const { summary, units, today, exercisesById, isLoading, error, retry } = useWeeklySummary(params.week);

  if (error) return <ErrorState fill title="Couldn't load your week" onRetry={retry} />;
  if (isLoading || !summary) return <ScreenSkeleton hero />;

  return (
    <WeeklySummaryView
      summary={summary}
      units={units}
      today={today}
      exercisesById={exercisesById}
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onToday={() => {
        // Close every screen on top of the tabs, then show Today.
        if (router.canDismiss()) router.dismissAll();
        router.navigate('/');
      }}
    />
  );
}
