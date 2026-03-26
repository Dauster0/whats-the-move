import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeSuggestion } from "./concierge-types";
import { conciergeSuggestionKey } from "./concierge-suggestion-key";

const STORAGE_KEY = "suggestion_decay_v1";

export type DecayEntry = {
  lastShownAt: number;
  timesShown: number;
  timesRejected: number;
  timesCommitted: number;
  timesBookmarked: number;
  lastRejectedAt?: number;
  lastCommittedAt?: number;
  neverShow: boolean;
  /** Don’t resurface in auto deck while user keeps it saved (cleared on unsave). */
  pinnedFromBookmark: boolean;
  displayName?: string;
};

type DecayMap = Record<string, DecayEntry>;

const DAY_MS = 86400000;

function defaultEntry(partial?: Partial<DecayEntry>): DecayEntry {
  return {
    lastShownAt: partial?.lastShownAt ?? 0,
    timesShown: partial?.timesShown ?? 0,
    timesRejected: partial?.timesRejected ?? 0,
    timesCommitted: partial?.timesCommitted ?? 0,
    timesBookmarked: partial?.timesBookmarked ?? 0,
    lastRejectedAt: partial?.lastRejectedAt,
    lastCommittedAt: partial?.lastCommittedAt,
    neverShow: partial?.neverShow ?? false,
    pinnedFromBookmark: partial?.pinnedFromBookmark ?? false,
    displayName: partial?.displayName,
  };
}

async function loadMap(): Promise<DecayMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as DecayMap;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

async function saveMap(map: DecayMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function displayNameFor(s: ConciergeSuggestion): string {
  return String(s.title || s.sourcePlaceName || s.mapQuery || "Move").trim().slice(0, 100);
}

export function decayKeyForSuggestion(s: ConciergeSuggestion): string {
  return conciergeSuggestionKey(s);
}

/** Milliseconds remaining before this key can appear in the auto deck again; 0 = OK. Infinity = blocked. */
export function cooldownRemainingMs(entry: DecayEntry, now: number): number {
  if (entry.neverShow) return Number.POSITIVE_INFINITY;
  if (entry.pinnedFromBookmark) return Number.POSITIVE_INFINITY;

  if (entry.timesCommitted > 0 && entry.lastCommittedAt) {
    const until = entry.lastCommittedAt + 7 * DAY_MS;
    if (now < until) return until - now;
  }

  const r = entry.timesRejected || 0;
  if (r >= 3 && entry.lastRejectedAt) {
    const until = entry.lastRejectedAt + 60 * DAY_MS;
    if (now < until) return until - now;
  }
  if (r === 2 && entry.lastRejectedAt) {
    const until = entry.lastRejectedAt + 14 * DAY_MS;
    if (now < until) return until - now;
  }
  if (r === 1 && entry.lastRejectedAt) {
    const until = entry.lastRejectedAt + 3 * DAY_MS;
    if (now < until) return until - now;
  }

  if (
    (entry.timesShown || 0) >= 1 &&
    r === 0 &&
    (entry.timesCommitted || 0) === 0 &&
    entry.lastShownAt
  ) {
    const until = entry.lastShownAt + DAY_MS;
    if (now < until) return until - now;
  }

  return 0;
}

export async function getDecayExcludedKeys(nowMs: number = Date.now()): Promise<string[]> {
  const map = await loadMap();
  const out: string[] = [];
  for (const [key, entry] of Object.entries(map)) {
    if (cooldownRemainingMs(entry, nowMs) > 0) out.push(key);
  }
  return out;
}

/** For GPT: names the user has recently seen, rejected, or blocked — do not repeat. */
export async function getDecayContextForGpt(nowMs: number = Date.now()): Promise<string[]> {
  const map = await loadMap();
  const windowMs = 14 * DAY_MS;
  const names = new Set<string>();
  for (const entry of Object.values(map)) {
    if (entry.neverShow) {
      if (entry.displayName) names.add(entry.displayName);
      continue;
    }
    const recent =
      nowMs - (entry.lastShownAt || 0) < windowMs ||
      (entry.lastRejectedAt && nowMs - entry.lastRejectedAt < windowMs) ||
      (entry.lastCommittedAt && nowMs - entry.lastCommittedAt < windowMs);
    if (recent && entry.displayName) names.add(entry.displayName);
  }
  return [...names].slice(0, 48);
}

async function mutate(key: string, fn: (e: DecayEntry) => DecayEntry) {
  if (!key) return;
  const map = await loadMap();
  const prev = map[key] ? { ...map[key] } : defaultEntry();
  map[key] = fn(prev);
  await saveMap(map);
}

export async function recordDecayShown(s: ConciergeSuggestion) {
  const key = decayKeyForSuggestion(s);
  const name = displayNameFor(s);
  const now = Date.now();
  await mutate(key, (e) => ({
    ...e,
    lastShownAt: now,
    timesShown: (e.timesShown || 0) + 1,
    displayName: name || e.displayName,
  }));
}

/** One read/write after a new deck loads — marks every card as shown. */
export async function recordDecayDeckDisplayed(list: ConciergeSuggestion[]) {
  if (!list.length) return;
  const map = await loadMap();
  const now = Date.now();
  for (const s of list) {
    const key = decayKeyForSuggestion(s);
    if (!key) continue;
    const prev = map[key] ? { ...map[key] } : defaultEntry();
    map[key] = {
      ...prev,
      lastShownAt: now,
      timesShown: (prev.timesShown || 0) + 1,
      displayName: displayNameFor(s) || prev.displayName,
    };
  }
  await saveMap(map);
}

export async function recordDecayRejected(s: ConciergeSuggestion) {
  const key = decayKeyForSuggestion(s);
  const name = displayNameFor(s);
  const now = Date.now();
  await mutate(key, (e) => ({
    ...e,
    lastRejectedAt: now,
    timesRejected: (e.timesRejected || 0) + 1,
    displayName: name || e.displayName,
  }));
}

export async function recordDecayCommitted(s: ConciergeSuggestion) {
  const key = decayKeyForSuggestion(s);
  const name = displayNameFor(s);
  const now = Date.now();
  await mutate(key, (e) => ({
    ...e,
    lastCommittedAt: now,
    timesCommitted: (e.timesCommitted || 0) + 1,
    displayName: name || e.displayName,
  }));
}

export async function recordDecayBookmarkPinned(s: ConciergeSuggestion) {
  const key = decayKeyForSuggestion(s);
  const name = displayNameFor(s);
  await mutate(key, (e) => ({
    ...e,
    timesBookmarked: (e.timesBookmarked || 0) + 1,
    pinnedFromBookmark: true,
    displayName: name || e.displayName,
  }));
}

export async function recordDecayBookmarkUnpinned(s: ConciergeSuggestion) {
  const key = decayKeyForSuggestion(s);
  await mutate(key, (e) => ({
    ...e,
    pinnedFromBookmark: false,
  }));
}

export async function recordDecayNeverShow(s: ConciergeSuggestion) {
  const key = decayKeyForSuggestion(s);
  const name = displayNameFor(s);
  await mutate(key, (e) => ({
    ...e,
    neverShow: true,
    displayName: name || e.displayName,
  }));
}

export function filterSuggestionsByDecay(
  list: ConciergeSuggestion[],
  nowMs: number,
  decayKeyCooldown: Set<string>
): ConciergeSuggestion[] {
  return list.filter((s) => {
    const k = decayKeyForSuggestion(s);
    return !decayKeyCooldown.has(k);
  });
}
