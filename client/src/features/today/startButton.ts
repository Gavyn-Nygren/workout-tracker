import type { ISODate } from '@/data/types';
import type { DayItem } from './agenda';

export type StartButton = {
  title: string;
  /** Spoken instead of the title when the card has a position, which VoiceOver would read as a fraction. */
  accessibilityLabel?: string;
  /** The filled main button (Start or Resume); the others are secondary. */
  main: boolean;
};

/**
 * A Today card's start button, or none for a finished workout (spec 2.5). A workout in progress
 * gets Resume, even one started early on a future day.
 */
export function startButton(item: Pick<DayItem, 'status' | 'date'>, today: ISODate, index: number, total: number): StartButton | undefined {
  const position = total > 1 ? ` ${index + 1}/${total}` : '';
  // VoiceOver reads "1/2" as "one half", so the spoken labels spell the position out.
  const spokenPosition = ` ${index + 1} of ${total}`;
  const spoken = (label: string) => (total > 1 ? label : undefined);
  switch (item.status) {
    case 'in_progress':
      return { title: `Resume Workout${position}`, accessibilityLabel: spoken(`Resume workout${spokenPosition}`), main: true };
    case 'planned':
    case 'missed':
      return item.date > today
        ? { title: `Start early${position}`, accessibilityLabel: spoken(`Start workout${spokenPosition} early`), main: false }
        : { title: `Start Workout${position}`, accessibilityLabel: spoken(`Start workout${spokenPosition}`), main: true };
    case 'skipped':
      return { title: `Start anyway${position}`, accessibilityLabel: spoken(`Start workout${spokenPosition} anyway`), main: false };
    default:
      return undefined;
  }
}
