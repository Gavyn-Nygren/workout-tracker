import { View } from 'react-native';

import { Card, ListRow, SectionHeader } from '@/components/ui';
import type { ISODate } from '@/data/types';
import { formatShortDate } from '@/lib/format';
import { spacing } from '@/theme/tokens';
import type { DayItem } from './agenda';

type Props = {
  items: DayItem[];
  onSelect: (date: ISODate) => void;
};

/** The next few planned workouts after the selected day; tap to jump to that day. */
export function ComingUp({ items, onSelect }: Props) {
  if (!items.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Coming up" />
      <Card padding="none">
        {items.map((item, i) => (
          <ListRow
            key={item.key}
            title={item.name}
            subtitle={`${formatShortDate(item.date)}${item.plan ? ` · ${item.plan.name}` : ''}`}
            icon={/core|abs/i.test(item.name) ? 'figure.core.training' : 'dumbbell'}
            value={item.workout?.estimatedMinutes ? `~${item.workout.estimatedMinutes} min` : undefined}
            onPress={() => onSelect(item.date)}
            separator={i < items.length - 1}
          />
        ))}
      </Card>
    </View>
  );
}
