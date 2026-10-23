import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Icon } from '@/components/ui';
import type { StarterTemplate } from '@/data/types';
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
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${template.name}. ${CATEGORY_LABEL[template.category]}. ${templateMeta(template)}`}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.85 : 1 }}>
          <View style={styles.stack}>
            <View style={styles.row}>
              <View style={[styles.category, { backgroundColor: colors.accentSubtle }]}>
                <AppText variant="caption" weight="800" tone="accent">
                  {CATEGORY_LABEL[template.category].toUpperCase()}
                </AppText>
              </View>
              {!template.workouts.length && (
                <AppText variant="caption" tone="tertiary">
                  Preview soon
                </AppText>
              )}
            </View>
            <AppText variant="title3" weight="700">
              {template.name}
            </AppText>
            <AppText variant="subhead" tone="secondary" numberOfLines={2}>
              {template.description}
            </AppText>
            <View style={styles.row}>
              <AppText variant="footnote" weight="600" style={styles.flex} numeric>
                {templateMeta(template)}
              </AppText>
              <View style={styles.icons} accessibilityLabel={`Equipment: ${template.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ')}`}>
                {template.equipment.map((e) => (
                  <Icon key={e} name={EQUIPMENT_ICON[e]} color={colors.textSecondary} size={15} />
                ))}
              </View>
            </View>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
