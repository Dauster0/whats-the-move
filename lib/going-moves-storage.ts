import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeSuggestion } from "./concierge-types";

const KEY = "@concierge/going-moves-v1";
const CAP = 200;

export type GoingMove = {
  id: string;
  savedAt: string;
  suggestion: ConciergeSuggestion;
};

function stableId(s: ConciergeSuggestion) {
  const base = `${s.title}|${s.mapQuery}|${s.ticketEventId || ""}|${s.googlePlaceResourceName || ""}`;
  return String(base).slice(0, 200);
}

export async function getGoingMoves(): Promise<GoingMove[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as GoingMove[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function addGoingMove(suggestion: ConciergeSuggestion): Promise<void> {
  const id = stableId(suggestion);
  const existing = await getGoingMoves();
  if (existing.some((x) => x.id === id)) return;
  const next: GoingMove[] = [
    { id, savedAt: new Date().toISOString(), suggestion },
    ...existing.filter((x) => x.id !== id),
  ].slice(0, CAP);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function removeGoingMove(id: string): Promise<void> {
  const existing = await getGoingMoves();
  await AsyncStorage.setItem(KEY, JSON.stringify(existing.filter((x) => x.id !== id)));
}

export async function isGoingMove(suggestion: ConciergeSuggestion): Promise<boolean> {
  const id = stableId(suggestion);
  const existing = await getGoingMoves();
  return existing.some((x) => x.id === id);
}
