import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

type Props = {
  name: SFSymbol;
  color: ColorValue;
  size?: number;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
};

/** SF Symbol icon (spec 2.13). Decorative by default; give the surrounding control the label. */
export function Icon({ name, color, size = 20, weight = 'semibold', style }: Props) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      weight={weight}
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
