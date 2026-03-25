import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeSuggestion } from "./concierge-types";
import { conciergeSuggestionKey } from "./concierge-suggestion-key";

const KEY = "concierge_shown_ids_v1";
const MAX_PERSISTED = 20;
const TODAY_KEY = "concierge_shown_today_v1";
const MAX_TODAY = 18;

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** In-memory only — clears when the JS runtime is torn down (app fully closed). */
const sessionExcludeSet = new Set<string>();

function formatYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Keys + place-name markers (n:...) for this app session — never cleared on deck refresh. */
export function collectExcludeMarkersForSuggestion(s: ConciergeSuggestion): string[] {
  const out: string[] = [];
  const k = conciergeSuggestionKey(s);
  if (k) out.push(k);
  const sn = norm(s.sourcePlaceName);
  if (sn.length >= 3) out.push(`n:${sn}`);
  const title = s.title || "";
  const at = title.toLowerCase().indexOf(" at ");
  if (at >= 0) {
    const venue = norm(title.slice(at + 4));
    if (venue.length >= 3) out.push(`n:${venue}`);
  }
  return out;
}

function registerMarkersToSession(markers: string[]) {
  for (const m of markers) {
    if (m) sessionExcludeSet.add(m);
  }
}

async function loadTodayMarkers(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(TODAY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { ymd?: string; items?: string[] };
    if (data?.ymd !== formatYmd() || !Array.isArray(data.items)) return [];
    return data.items.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

async function mergeTodayMarkers(markers: string[]) {
  if (markers.length === 0) return;
  try {
    const ymd = formatYmd();
    const prev = await loadTodayMarkers();
    const next = [...new Set([...markers, ...prev])].slice(0, MAX_TODAY);
    await AsyncStorage.setItem(TODAY_KEY, JSON.stringify({ ymd, items: next }));
  } catch {
    /* ignore */
  }
}

async function loadPersistedSwipeKeys(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function savePersistedSwipeKeys(ids: string[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_PERSISTED)));
  } catch {
    /* ignore */
  }
}

/** Keys to exclude from concierge API: session (until app kill) + today's deck + swipe history. */
export async function getExcludeSuggestionKeys(): Promise<string[]> {
  const persisted = await loadPersistedSwipeKeys();
  const today = await loadTodayMarkers();
  return [...new Set([...sessionExcludeSet, ...today, ...persisted])];
}

/** Call when a new deck is applied — session + today's persisted list grow; not cleared on reset. */
export function registerDeckKeys(list: ConciergeSuggestion[]) {
  const batch: string[] = [];
  for (const s of list) {
    const m = collectExcludeMarkersForSuggestion(s);
    batch.push(...m);
    registerMarkersToSession(m);
  }
  void mergeTodayMarkers(batch);
}

/** Swipe left/right — persist canonical keys for cross-session variety. */
export function persistSwipeForHistory(s: ConciergeSuggestion) {
  const markers = collectExcludeMarkersForSuggestion(s);
  registerMarkersToSession(markers);
  void mergeTodayMarkers(markers);
  const k = conciergeSuggestionKey(s);
  if (!k) return;
  void (async () => {
    const prev = await loadPersistedSwipeKeys();
    const next = [k, ...prev.filter((x) => x !== k)].slice(0, MAX_PERSISTED);
    await savePersistedSwipeKeys(next);
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
