import { StyleSheet, type ViewStyle } from 'react-native';

import type { ThemeColors } from '@/theme/tokens';
import { radius } from '@/theme/tokens';

/**
 * One row of a card drawn row by row, so a long list inside a "card" can be virtualized: the card's
 * surface and border, rounded at the first and last rows, with a hairline between rows.
 */
export function cardSegment(colors: Pick<ThemeColors, 'card' | 'border'>, first: boolean, last: boolean): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: first ? StyleSheet.hairlineWidth : 0,
    borderTopLeftRadius: first ? radius.card : 0,
    borderTopRightRadius: first ? radius.card : 0,
    borderBottomLeftRadius: last ? radius.card : 0,
    borderBottomRightRadius: last ? radius.card : 0,
  };
}
