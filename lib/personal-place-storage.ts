import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlaceSuggestion } from "./curated-places";

const PERSONAL_PLACES_KEY = "personal_places_v1";

export type StoredPersonalPlace = PlaceSuggestion;

export async function getStoredPersonalPlaces(): Promise<StoredPersonalPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(PERSONAL_PLACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveStoredPersonalPlaces(
  places: StoredPersonalPlace[]
): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_PLACES_KEY, JSON.stringify(places));
}

export async function addStoredPersonalPlace(
  place: StoredPersonalPlace
): Promise<void> {
  const current = await getStoredPersonalPlaces();

  const withoutSameId = current.filter((p) => p.id !== place.id);

  await saveStoredPersonalPlaces([place, ...withoutSameId]);
}

export async function removeStoredPersonalPlace(id: string): Promise<void> {
  const current = await getStoredPersonalPlaces();
  const next = current.filter((p) => p.id !== id);
  await saveStoredPersonalPlaces(next);
}