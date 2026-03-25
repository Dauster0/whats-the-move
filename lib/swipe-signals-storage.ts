import AsyncStorage from "@react-native-async-storage/async-storage";
import { getHiddenSuggestions } from "./hidden-suggestions-storage";

const KEY = "concierge_swipe_events_v1";
const MAX_EVENTS = 400;
/** After this many tracked swipes, send aggregates to the concierge model. */
const MIN_FOR_API = 20;

export type SwipeSignalsPayload = {
  strong_yes: string[];
  skipped_often: string[];
  never_show: string[];
};

type SwipeType = "commit" | "skip" | "bookmark";

function normCat(c: string) {
  return String(c || "other")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 48);
}

async function load(): Promise<{ type: SwipeType; category: string; at: string }[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

async function append(ev: { type: SwipeType; category: string }) {
  const prev = await load();
  const next = [{ ...ev, at: new Date().toISOString() }, ...prev].slice(0, MAX_EVENTS);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function recordSwipeCommit(category: string) {
  await append({ type: "commit", category: normCat(category) });
}

export async function recordSwipeSkip(category: string) {
  await append({ type: "skip", category: normCat(category) });
}

export async function recordSwipeBookmark(category: string) {
  await append({ type: "bookmark", category: normCat(category) });
}

export async function getSwipeSignalsForApi(): Promise<SwipeSignalsPayload | null> {
  const events = await load();
  if (events.length < MIN_FOR_API) return null;

  const yesCounts: Record<string, number> = {};
  const skipCounts: Record<string, number> = {};

  for (const e of events) {
    const c = e.category || "other";
    if (e.type === "commit" || e.type === "bookmark") {
      yesCounts[c] = (yesCounts[c] || 0) + 1;
    }
    if (e.type === "skip") {
      skipCounts[c] = (skipCounts[c] || 0) + 1;
    }
  }

  const strong_yes = Object.entries(yesCounts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k.replace(/_/g, " "));

  const skipped_often = Object.entries(skipCounts)
    .filter(([cat, n]) => n >= 3 && n > (yesCounts[cat] || 0))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k.replace(/_/g, " "));

  const hidden = await getHiddenSuggestions();
  const never_show = hidden.map((h) => h.title).filter(Boolean).slice(0, 24);

  return { strong_yes, skipped_often, never_show };
}
