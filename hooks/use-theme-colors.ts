import { getColors } from "../lib/theme";

/** Product identity: one dark, image-forward palette everywhere (not system light mode). */
export function useThemeColors() {
  return getColors(true);
}
