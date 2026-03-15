/**
 * Time-of-day awareness for suggestions.
 * No clubbing at noon.
 */

export type TimeOfDay = "morning" | "midday" | "afternoon" | "evening" | "night";

export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 21) return "evening";
  return "night"; // 9pm-5am
}

/** True if it's appropriate to suggest nightclubs/clubbing (after 6pm). */
export function isNightlifeTime(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 18 || hour < 3; // 6pm-3am
}

/** Human-readable context for AI prompts. */
export function getTimeContext(date: Date = new Date()): string {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = dayNames[date.getDay()];
  const hour = date.getHours();
  const min = date.getMinutes();
  const timeStr = `${hour % 12 || 12}:${min.toString().padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  const tod = getTimeOfDay(date);
  return `It is ${day} ${timeStr} (${tod}).`;
}
