import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeSuggestion } from "./concierge-types";
import { isPlusEffectiveOrDev, loadEntitlements } from "./plus-entitlements";

const KEY = "@concierge/planning-moves-v1";
const MAX = 60;

export type PlanningConciergeMove = {
  id: string;
  plannedAt: string;
  suggestion: ConciergeSuggestion;
};

function stableId(s: ConciergeSuggestion) {
  const base = `${s.title}|${s.mapQuery}|${s.ticketEventId || ""}|${s.googlePlaceResourceName || ""}|${s.dateBadge || ""}`;
  return String(base).slice(0, 220);
}

export async function getPlanningConciergeMoves(): Promise<PlanningConciergeMove[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as PlanningConciergeMove[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function addPlanningConciergeMove(suggestion: ConciergeSuggestion): Promise<boolean> {
  const e = await loadEntitlements();
  if (!isPlusEffectiveOrDev(e)) return false;
  const id = stableId(suggestion);
  const existing = await getPlanningConciergeMoves();
  const next: PlanningConciergeMove[] = [
    { id, plannedAt: new Date().toISOString(), suggestion },
    ...existing.filter((x) => x.id !== id),
  ].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return true;
}

export async function removePlanningConciergeMove(id: string) {
  const existing = await getPlanningConciergeMoves();
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify(existing.filter((x) => x.id !== id))
  );
}

export async function isPlanningConciergeMove(suggestion: ConciergeSuggestion): Promise<boolean> {
  const id = stableId(suggestion);
  const existing = await getPlanningConciergeMoves();
  return existing.some((x) => x.id === id);
}
