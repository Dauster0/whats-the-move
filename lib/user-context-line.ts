import type { UserPreferences } from "../store/move-context";

/** Single paragraph for AI prompts (expand-moves) and optional future tuning. */
export function buildUserContextLine(prefs: UserPreferences): string {
  const bits: string[] = [];

  if (prefs.homeCity?.trim()) bits.push(`home area ${prefs.homeCity.trim()}`);
  if (prefs.schoolOrWork?.trim()) bits.push(`school or work context ${prefs.schoolOrWork.trim()}`);

  bits.push(`budget ${prefs.budget}`);
  bits.push(`energy ${prefs.energyMode}`);
  if (prefs.transportMode) bits.push(`gets around by ${prefs.transportMode}`);
  bits.push(`social style ${prefs.socialMode}`);
  bits.push(`social battery ${prefs.socialBattery}`);

  if (prefs.ageRange && prefs.ageRange !== "prefer_not") {
    bits.push(`age band ${prefs.ageRange}`);
  }

  if (prefs.interests?.length) {
    bits.push(`enjoys ${prefs.interests.slice(0, 14).join(", ")}`);
  }

  if (prefs.preferredTimes?.length && prefs.preferredTimes.length < 5) {
    bits.push(`usually free ${prefs.preferredTimes.join(", ")}`);
  }

  return bits.join(". ") + ".";
}
