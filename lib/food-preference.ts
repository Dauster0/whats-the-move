/** User preference for whether suggestions should involve eating / food venues. */
export type HungerPreference = "any" | "hungry" | "not_hungry";

const FOOD_CATEGORIES = new Set([
  "restaurant",
  "cafe",
  "coffee",
  "bakery",
  "ice_cream",
  "dessert",
  "market",
]);

export function isFoodCategory(category?: string): boolean {
  return FOOD_CATEGORIES.has((category || "").toLowerCase());
}

/** Returns false if candidate should be dropped for this preference. */
export function candidateMatchesHunger(
  category: string | undefined,
  pref: HungerPreference
): boolean {
  if (pref === "any") return true;
  const food = isFoodCategory(category);
  if (pref === "not_hungry") return !food;
  return true;
}

/** Sort key: hungry = food venues first (higher = earlier). */
export function hungerSortScore(category: string | undefined, pref: HungerPreference): number {
  if (pref !== "hungry") return 0;
  return isFoodCategory(category) ? 100 : 0;
}
