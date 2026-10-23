import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from './tokens';

/** Width at which a screen counts as "wide" (iPad, including iPad mini in portrait at 744 pt). */
export const WIDE_BREAKPOINT = 700;
/** Comfortable reading width for detail screens and forms on iPad. */
export const READABLE_MAX = 720;
/** Upper bound for two-column dashboards so lines don't stretch on 13" iPads. */
export const DASHBOARD_MAX = 1120;

/**
 * Centers content at a readable width. Has no effect on phones (narrower than the max), so it
 * can go on any ScrollView's contentContainerStyle.
 */
export const readable: ViewStyle = { width: '100%', maxWidth: READABLE_MAX, alignSelf: 'center' };
export const dashboard: ViewStyle = { width: '100%', maxWidth: DASHBOARD_MAX, alignSelf: 'center' };

export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, wide: width >= WIDE_BREAKPOINT };
}

type ColumnsProps = {
  /** Sections for the main column. */
  left: ReactNode;
  /** Sections for the side column. On phones they follow the left ones. */
  right: ReactNode;
  /** Left column share; the right column gets 1. */
  leftFlex?: number;
  /** Space between sections inside a column. */
  gap?: number;
  /** Space between the two columns. Defaults to `gap`. */
  columnGap?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Two columns on iPad, one on phones (user's pick: two-column dashboards). On phones the
 * sections are rendered straight into the parent, so its own `gap` spacing still applies.
 */
export function Columns({ left, right, leftFlex = 1.2, gap = spacing.xl, columnGap = gap, style }: ColumnsProps) {
  const { wide } = useLayout();
  if (!wide) {
    return (
      <>
        {Children.toArray(left).filter(isValidElement)}
        {Children.toArray(right).filter(isValidElement)}
      </>
    );
  }
  return (
    <View style={[styles.row, { gap: columnGap }, style]}>
      <View style={[styles.column, { flex: leftFlex, gap }]}>{left}</View>
      <View style={[styles.column, { flex: 1, gap }]}>{right}</View>
    </View>
  );
}

/**
 * Cards two per row on iPad, one per row on phones. Rows are built explicitly so an odd last
 * card keeps the same width instead of stretching.
 */
export function Grid({ children, gap = spacing.md }: { children: ReactNode; gap?: number }) {
  const { wide } = useLayout();
  const items = Children.toArray(children).filter(isValidElement);
  if (!items.length) return null;
  if (!wide) return <>{items}</>;
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.gridRow, { gap }]}>
          {row.map((item, c) => (
            <View key={c} style={styles.cell}>
              {item}
            </View>
          ))}
          {row.length === 1 && <View style={styles.cell} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    minWidth: 0,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
});

/**
 * Large text (user's pick: scale fully, reflow rows). Text grows with the iOS text size setting.
 * Dense, fixed-geometry spots cap at DENSE_TEXT_MAX; rows switch to stacked layouts once the
 * user is in iOS's accessibility sizes (AX1 body text is about 1.65× the default).
 */
export const DENSE_TEXT_MAX = 1.5;
const ACCESSIBILITY_SIZES = 1.5;

export function useTextScale() {
  const { fontScale } = useWindowDimensions();
  return { fontScale, large: fontScale >= ACCESSIBILITY_SIZES };
}
