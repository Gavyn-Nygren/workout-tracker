import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ListRow, useToast } from '@/components/ui';
import { spacing } from '@/theme/tokens';

/** App info and legal links (privacy policy and terms are written in G6.3). */
export default function AboutScreen() {
  const toast = useToast();
  const soon = () => toast.show({ message: 'Written before launch (roadmap G6.3).' });
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="title2">{Constants.expoConfig?.name ?? 'Exercise Tracker'}</AppText>
        <AppText variant="subhead" tone="secondary">{`Version ${Constants.expoConfig?.version ?? '1.0.0'} · preview build`}</AppText>
        <AppText variant="subhead" tone="secondary" style={styles.center}>
          For independent lifters. Logging, plans, progress, and on-device form analysis.
        </AppText>
      </View>
      <Card padding="none">
        <ListRow title="Replay the tour" icon="play.rectangle" onPress={() => router.push('/tutorial')} separator={false} />
      </Card>
      <Card padding="none">
        <ListRow title="Privacy policy" icon="hand.raised" onPress={soon} />
        <ListRow title="Terms of use" icon="doc.plaintext" onPress={soon} />
        <ListRow title="Open-source licenses" icon="chevron.left.forwardslash.chevron.right" onPress={soon} separator={false} />
      </Card>
      <AppText variant="footnote" tone="secondary" style={styles.center}>
        Educational fitness information only. Not medical advice.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  center: {
    textAlign: 'center',
  },
});
