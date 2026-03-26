import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeSuggestion } from "./concierge-types";

const KEY = "@concierge/detail-payload-v1";

export type ConciergeDetailPayload = {
  suggestion: ConciergeSuggestion;
  others: ConciergeSuggestion[];
  /** Opened from card tap — user must choose I’m going / Not for me (no auto-commit). */
  peek?: boolean;
};

/** Synchronous handoff so navigation never waits on AsyncStorage. */
let pendingPayload: ConciergeDetailPayload | null = null;

export function setPendingConciergeDetail(payload: ConciergeDetailPayload) {
  pendingPayload = payload;
}

export function consumePendingConciergeDetail(): ConciergeDetailPayload | null {
  const p = pendingPayload;
  pendingPayload = null;
  return p;
}

export async function setConciergeDetailPayload(payload: ConciergeDetailPayload) {
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export async function getConciergeDetailPayload(): Promise<ConciergeDetailPayload | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConciergeDetailPayload;
  } catch {
    return null;
  }
}

export async function clearConciergeDetailPayload() {
  await AsyncStorage.removeItem(KEY);
}
