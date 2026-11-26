import { Switch } from "react-native";

/*
 * Figma « Mobile — iOS natif » / « ChatGPT 1:1 »: settings use iOS's own controls. React Native's Switch
 * is UIKit's UISwitch (its track, thumb, haptic and VoiceOver as in Réglages), under HeroUI's prop names
 * so the rows that held HeroUI's Switch only swap the component.
 */
export function NativeSwitch({
  isSelected,
  isDisabled,
  onSelectedChange,
  accessibilityLabel,
}: {
  isSelected: boolean;
  isDisabled?: boolean;
  onSelectedChange?: (value: boolean) => void;
  accessibilityLabel?: string;
}) {
  return <Switch value={isSelected} disabled={isDisabled} onValueChange={onSelectedChange} accessibilityLabel={accessibilityLabel} />;
}
