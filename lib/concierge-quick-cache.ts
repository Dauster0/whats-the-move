import type { ConciergeSuggestion } from "./concierge-types";
import { conciergeSuggestionKey } from "./concierge-suggestion-key";

const TTL_MS = 6 * 60 * 1000;

type QuickBlob = Record<string, unknown>;

const cache = new Map<string, { at: number; data: QuickBlob }>();

export function cacheConciergeQuickSnapshot(s: ConciergeSuggestion, data: QuickBlob) {
  const key = conciergeSuggestionKey(s);
  cache.set(key, { at: Date.now(), data: { ...data } });
}

export function takeCachedConciergeQuick(s: ConciergeSuggestion): QuickBlob | null {
  const key = conciergeSuggestionKey(s);
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.data;
}

export function clearCachedConciergeQuick(s: ConciergeSuggestion) {
  cache.delete(conciergeSuggestionKey(s));
}
