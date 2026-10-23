// Component styles the user is still choosing between (roadmap G1.2). Components default to
// these; the component gallery's "Choices" section overrides them to compare alternatives.
// Once a style is picked, set it here and delete the losing variants.

export type SecondaryButtonStyle = 'tinted' | 'outlined' | 'gray';
export type StepperStyle = 'split' | 'joined';
export type ChipSelectedStyle = 'filled' | 'tinted';
export type TextFieldStyle = 'filled' | 'outlined';

export const designChoices = {
  secondaryButton: 'tinted' as SecondaryButtonStyle,
  stepper: 'split' as StepperStyle,
  chipSelected: 'filled' as ChipSelectedStyle,
  textField: 'filled' as TextFieldStyle,
};
