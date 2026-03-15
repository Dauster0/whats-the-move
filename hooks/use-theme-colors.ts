import { useColorScheme } from "react-native";
import { getColors } from "../lib/theme";

export function useThemeColors() {
  const colorScheme = useColorScheme();
  return getColors(colorScheme === "dark");
}
