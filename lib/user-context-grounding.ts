import type { AICandidate } from "./curated-experiences";
import type { UserPreferences } from "../store/move-context";

/**
 * Tie-breaker / soft boost for ranking grounded candidates.
 * Higher = better fit for this user (applied before hunger / wee-hours logic).
 */
export function scoreCandidateForPreferences(
  c: AICandidate,
  prefs: UserPreferences | undefined | null
): number {
  if (!prefs) return 0;

  let s = 0;
  const cat = (c.category || "").toLowerCase();
  const blob = `${c.exactTitle} ${c.sourceName} ${c.subtitle}`.toLowerCase();

  const introvertCats = new Set([
    "park",
    "museum",
    "gallery",
    "bookstore",
    "scenic",
    "trail",
    "coffee",
    "cafe",
  ]);
  const extrovertCats = new Set([
    "comedy",
    "live_music",
    "bar",
    "nightclub",
    "sports_event",
    "market",
    "restaurant",
  ]);

  if (prefs.socialBattery === "introvert") {
    if (introvertCats.has(cat)) s += 18;
    if (cat === "nightclub" || cat === "bar") s -= 12;
  } else if (prefs.socialBattery === "extrovert") {
    if (extrovertCats.has(cat)) s += 14;
  }

  if (prefs.budget === "free") {
    if (["park", "museum", "gallery", "scenic", "trail"].includes(cat)) s += 14;
    if (cat === "restaurant") s -= 6;
    if (c.priceText === "$") s += 8;
  } else if (prefs.budget === "flexible") {
    if (
      ["restaurant", "live_music", "theater", "theatre", "movie_theater", "comedy", "special_event"].some(
        (k) => cat === k || cat.includes(k)
      )
    ) {
      s += 10;
    }
  } else {
    if (c.priceText === "$" || c.priceText === "$$") s += 5;
  }

  if (prefs.energyMode === "low") {
    if (["museum", "gallery", "bookstore", "coffee", "cafe", "park", "scenic"].includes(cat)) s += 12;
    if (cat === "nightclub" || cat === "sports_event") s -= 8;
  } else if (prefs.energyMode === "high") {
    if (["live_music", "nightclub", "sports_event", "bowling", "arcade", "bar"].includes(cat)) s += 12;
  }

  if (prefs.socialMode === "solo") {
    if (["comedy", "movie_theater", "museum", "bookstore", "coffee", "cafe", "gallery"].includes(cat)) {
      s += 6;
    }
  } else if (prefs.socialMode === "social") {
    if (["comedy", "bar", "live_music", "restaurant", "nightclub", "market"].includes(cat)) s += 8;
  }

  if (prefs.placeMode === "outdoors") {
    if (["park", "scenic", "trail", "market", "outdoor_event"].includes(cat) || /walk|beach|hike/.test(blob)) {
      s += 10;
    }
  } else if (prefs.placeMode === "indoors") {
    if (["museum", "gallery", "bookstore", "movie_theater", "theater", "theatre", "comedy", "arcade", "bowling"].includes(cat)) {
      s += 10;
    }
  }

  for (const interest of prefs.interests || []) {
    const i = interest.toLowerCase().replace(/-/g, " ");
    if (i.includes("coffee") && (cat.includes("coffee") || cat === "cafe")) s += 9;
    if ((i.includes("walk") || i.includes("beach")) && (cat === "park" || cat === "scenic" || cat === "trail")) s += 9;
    if (i.includes("museum") && cat === "museum") s += 10;
    if (i.includes("bookstore") && cat === "bookstore") s += 10;
    if (i.includes("comedy") && cat === "comedy") s += 10;
    if (i.includes("nightlife") && (cat === "bar" || cat === "nightclub" || cat === "live_music")) s += 8;
    if (i.includes("movie") && (cat === "movie_theater" || cat === "cinema")) s += 8;
    if (i.includes("sport") && cat === "sports_event") s += 10;
  }

  return s;
}
