import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeSuggestion } from "./concierge-types";
import { recordSwipeBookmark } from "./swipe-signals-storage";

const KEY = "@concierge/saved-moves-v1";
const PLUS_SAVED_CAP = 500;

export type SavedConciergeMove = {
  id: string;
  savedAt: string;
  suggestion: ConciergeSuggestion;
};

function stableId(s: ConciergeSuggestion) {
  const base = `${s.title}|${s.mapQuery}|${s.ticketEventId || ""}|${s.googlePlaceResourceName || ""}`;
  return String(base).slice(0, 200);
}

export async function getSavedConciergeMoves(): Promise<SavedConciergeMove[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as SavedConciergeMove[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveConciergeMove(
  suggestion: ConciergeSuggestion,
  maxSlots: number = PLUS_SAVED_CAP
): Promise<boolean> {
  const id = stableId(suggestion);
  const existing = await getSavedConciergeMoves();
  if (existing.some((x) => x.id === id)) return false;
  if (existing.length >= maxSlots) return false;
  const next: SavedConciergeMove[] = [
    { id, savedAt: new Date().toISOString(), suggestion },
    ...existing.filter((x) => x.id !== id),
  ].slice(0, maxSlots);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  void recordSwipeBookmark(suggestion.category || "experience");
  return true;
}

export async function removeSavedConciergeMove(id: string) {
  const existing = await getSavedConciergeMoves();
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify(existing.filter((x) => x.id !== id))
  );
}

export async function isConciergeMoveSaved(suggestion: ConciergeSuggestion): Promise<boolean> {
  const id = stableId(suggestion);
  const existing = await getSavedConciergeMoves();
  return existing.some((x) => x.id === id);
}

export type ToggleSaveResult = { saved: boolean };

/** Returns saved state after toggle. */
export async function toggleSavedConciergeMove(
  suggestion: ConciergeSuggestion,
  options?: { plusUnlimited?: boolean }
): Promise<ToggleSaveResult> {
  const maxSlots = PLUS_SAVED_CAP;
  const id = stableId(suggestion);
  const existing = await getSavedConciergeMoves();
  if (existing.some((x) => x.id === id)) {
    await removeSavedConciergeMove(id);
    return { saved: false };
  }
  const ok = await saveConciergeMove(suggestion, maxSlots);
  if (!ok) return { saved: false };
  return { saved: true };
}
