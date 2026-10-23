import { Switch } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

type Props = {
  /** Read by VoiceOver; usually the title of the row the toggle sits in. */
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * iOS switch tinted with the accent. Place it as the trailing content of a ListRow. The off
 * track is left to iOS, whose adaptive gray stays visible on cards in both themes.
 */
export function Toggle({ label, value, onChange, disabled }: Props) {
  const { colors } = useAppTheme();
  return <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} trackColor={{ true: colors.accentText }} />;
}
