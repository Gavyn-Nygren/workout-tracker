import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, SectionHeader, SetTag, setTagLabel, type SetTagValue } from '@/components/ui';
import type { SetKind, SetModifier } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const KINDS: Exclude<SetKind, 'normal'>[] = ['warmup', 'drop', 'timed_hold', 'assisted'];
const MODIFIERS: SetModifier[] = ['amrap', 'to_failure', 'shortened_partials', 'lengthened_partials'];

/** Demo of the native iOS sheet, styled as the set-type picker the active workout screen will use. */
export default function SheetDemo() {
  const { colors } = useAppTheme();
  const [kind, setKind] = useState<SetKind>('normal');
  const [modifiers, setModifiers] = useState<SetModifier[]>(['to_failure']);

  const tags: SetTagValue[] = [...(kind === 'normal' ? [] : [kind]), ...modifiers];

  return (
    <ScrollView style={{ backgroundColor: colors.cardElevated }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="title2" accessibilityRole="header">
          Set 3 type
        </AppText>
        <AppText variant="subhead" tone="secondary">
          A set has one kind and any number of modifiers.
        </AppText>
      </View>

      <SectionHeader title="Kind" />
      <View style={styles.wrapRow}>
        <Chip label="Normal" role="radio" selected={kind === 'normal'} onPress={() => setKind('normal')} />
        {KINDS.map((k) => (
          <Chip key={k} label={setTagLabel(k)} role="radio" selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>

      <SectionHeader title="Modifiers" />
      <View style={styles.wrapRow}>
        {MODIFIERS.map((m) => (
          <Chip
            key={m}
            label={setTagLabel(m)}
            selected={modifiers.includes(m)}
            onPress={() => setModifiers((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))}
          />
        ))}
      </View>

      <SectionHeader title="Preview" />
      <View style={styles.wrapRow}>
        {tags.length ? tags.map((t) => <SetTag key={t} tag={t} />) : <AppText tone="secondary">Normal working set</AppText>}
      </View>

      <Button title="Done" onPress={() => router.back()} fullWidth style={styles.done} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  done: {
    marginTop: spacing.lg,
  },
});
