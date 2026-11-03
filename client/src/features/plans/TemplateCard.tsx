import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, PressableScale } from '@/components/ui';
import type { StarterTemplate } from '@/data/types';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { EQUIPMENT_ICON, EQUIPMENT_LABEL } from '../exercises/ExerciseList';
import { CATEGORY_LABEL, templateMeta } from './describe';

/** A starter template in the Templates list (user's pick: category chips + cards). */
export function TemplateCard({ template, onPress }: { template: StarterTemplate; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const equipment = template.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ');
  // Every day version's days ("2 or 3 days/week"); the program page picks one.
  const meta = templateMeta(template);
  return (
    <PressableScale
      onPress={onPress}
      style={styles.fill}
      accessibilityRole="button"
      accessibilityLabel={`${template.name}. ${CATEGORY_LABEL[template.category]}. ${meta.replace(/ {2}· {2}/g, ', ')}${equipment ? `. Equipment: ${equipment}` : ''}`}
    >
      <Card style={styles.fill}>
        <View style={styles.stack}>
          <View style={[styles.category, { backgroundColor: colors.accentSubtle }]}>
            <AppText variant="caption" weight="800" tone="accent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              {CATEGORY_LABEL[template.category].toUpperCase()}
            </AppText>
          </View>
          <AppText variant="title3" weight="700">
            {template.name}
          </AppText>
          <AppText variant="subhead" tone="secondary" numberOfLines={large ? 4 : 2}>
            {template.description}
          </AppText>
          <View style={styles.row}>
            <AppText variant="footnote" weight="600" style={styles.flex} numeric>
              {meta}
            </AppText>
            <View style={styles.icons}>
              {template.equipment.map((e) => (
                <Icon key={e} name={EQUIPMENT_ICON[e]} color={colors.textSecondary} size={15} />
              ))}
            </View>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Fills a grid cell on iPad so cards in a row match heights.
  fill: {
    flexGrow: 1,
  },
  stack: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  category: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  icons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
