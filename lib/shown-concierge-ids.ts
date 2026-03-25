import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeSuggestion } from "./concierge-types";
import { conciergeSuggestionKey } from "./concierge-suggestion-key";

const KEY = "concierge_shown_ids_v1";
const MAX_PERSISTED = 20;

/** Every suggestion key that has appeared in a deck this app session (excluded from new fetches). */
const sessionDeckKeys = new Set<string>();

async function loadPersisted(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function savePersisted(ids: string[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_PERSISTED)));
  } catch {
    /* ignore */
  }
}

/** Keys to exclude from concierge API (session + last N swipes across launches). */
export async function getExcludeSuggestionKeys(): Promise<string[]> {
  const persisted = await loadPersisted();
  return [...new Set([...persisted, ...sessionDeckKeys])];
}

/** Call whenever a new deck is applied so we never repeat in the same session. */
export function registerDeckKeys(list: ConciergeSuggestion[]) {
  for (const s of list) {
    const k = conciergeSuggestionKey(s);
    if (k) sessionDeckKeys.add(k);
  }
}

/** Swipe left/right — persist for cross-session variety. */
export function persistSwipeForHistory(s: ConciergeSuggestion) {
  const k = conciergeSuggestionKey(s);
  if (!k) return;
  void (async () => {
    const prev = await loadPersisted();
    const next = [k, ...prev.filter((x) => x !== k)].slice(0, MAX_PERSISTED);
    await savePersisted(next);
  })();
}

/** Dedupe same venue/event twice in one API response. */
export function dedupeWithinList(list: ConciergeSuggestion[]): ConciergeSuggestion[] {
  const seen = new Set<string>();
  const out: ConciergeSuggestion[] = [];
  for (const s of list) {
    const k = conciergeSuggestionKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
