import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, PressableScale } from '@/components/ui';
import type { StarterTemplate } from '@/data/types';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { EQUIPMENT_ICON, EQUIPMENT_LABEL } from '../exercises/ExerciseList';
import { CATEGORY_LABEL, LEVEL_LABEL } from './describe';

export function templateMeta(template: StarterTemplate): string {
  return [LEVEL_LABEL[template.level], `${template.daysPerWeek} days/week`, template.durationWeeks ? `${template.durationWeeks} weeks` : 'Ongoing'].join('  ·  ');
}

/** A starter template in the Templates list (user's pick: category chips + cards). */
export function TemplateCard({ template, onPress }: { template: StarterTemplate; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const equipment = template.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ');
  return (
    <PressableScale
      onPress={onPress}
      style={styles.fill}
      accessibilityRole="button"
      accessibilityLabel={`${template.name}. ${CATEGORY_LABEL[template.category]}${template.workouts.length ? '' : ', preview soon'}. ${templateMeta(template).replace(/ {2}· {2}/g, ', ')}${equipment ? `. Equipment: ${equipment}` : ''}`}
    >
      <Card style={styles.fill}>
        <View style={styles.stack}>
          <View style={styles.row}>
            <View style={[styles.category, { backgroundColor: colors.accentSubtle }]}>
              <AppText variant="caption" weight="800" tone="accent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                {CATEGORY_LABEL[template.category].toUpperCase()}
              </AppText>
            </View>
            {!template.workouts.length && (
              <AppText variant="caption" tone="secondary">
                Preview soon
              </AppText>
            )}
          </View>
          <AppText variant="title3" weight="700">
            {template.name}
          </AppText>
          <AppText variant="subhead" tone="secondary" numberOfLines={large ? 4 : 2}>
            {template.description}
          </AppText>
          <View style={styles.row}>
            <AppText variant="footnote" weight="600" style={styles.flex} numeric>
              {templateMeta(template)}
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
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  icons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
